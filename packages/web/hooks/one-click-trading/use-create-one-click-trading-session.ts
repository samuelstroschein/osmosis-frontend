import { toBase64 } from "@cosmjs/encoding";
import { WalletRepo } from "@cosmos-kit/core";
import { PrivKeySecp256k1 } from "@keplr-wallet/crypto";
import { Dec, DecUtils } from "@keplr-wallet/unit";
import {
  AvailableOneClickTradingMessages,
  OneClickTradingTimeLimit,
  OneClickTradingTransactionParams,
  ParsedAuthenticator,
} from "@osmosis-labs/types";
import {
  isNil,
  unixNanoSecondsToSeconds,
  unixSecondsToNanoSeconds,
} from "@osmosis-labs/utils";
import dayjs from "dayjs";
import { useCallback } from "react";
import { useLocalStorage } from "react-use";

import { dismissAllToasts, displayToast, ToastType } from "~/components/alert";
import { OneClickFloatingBannerDoNotShowKey } from "~/components/one-click-trading/one-click-floating-banner";
import { useTranslation } from "~/hooks/language";
import {
  AddAuthenticatorQueryOptions,
  getFirstAuthenticator,
  getOneClickTradingSessionAuthenticator,
  useAddOrRemoveAuthenticators,
} from "~/hooks/mutations/osmosis/add-or-remove-authenticators";
import { useStore } from "~/stores";
import { humanizeTime } from "~/utils/date";
import { api } from "~/utils/trpc";

export class CreateOneClickSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletSelectOneClickError";
  }
}

export const useCreateOneClickTradingSession = ({
  addAuthenticatorsQueryOptions,
}: {
  addAuthenticatorsQueryOptions: AddAuthenticatorQueryOptions;
}) => {
  const { accountStore } = useStore();
  const addAuthenticators = useAddOrRemoveAuthenticators({
    queryOptions: addAuthenticatorsQueryOptions,
  });
  const apiUtils = api.useUtils();
  const [, setDoNotShowFloatingBannerAgain] = useLocalStorage(
    OneClickFloatingBannerDoNotShowKey,
    false
  );
  const { t } = useTranslation();

  const onCreate1CTSession = useCallback(
    async ({
      walletRepo,
      transaction1CTParams,
      spendLimitTokenDecimals,
    }: {
      walletRepo: WalletRepo;
      spendLimitTokenDecimals: number | undefined;
      transaction1CTParams: OneClickTradingTransactionParams | undefined;
    }) => {
      if (!transaction1CTParams)
        throw new CreateOneClickSessionError(
          "Transaction 1CT params are not defined."
        );

      if (!walletRepo.current)
        throw new CreateOneClickSessionError(
          "walletRepo.current is not defined."
        );
      if (!spendLimitTokenDecimals)
        throw new CreateOneClickSessionError(
          "Spend limit token decimals are not defined."
        );

      let accountPubKey: string,
        shouldAddFirstAuthenticator: boolean,
        authenticators: ParsedAuthenticator[];
      try {
        ({ accountPubKey, shouldAddFirstAuthenticator, authenticators } =
          await apiUtils.edge.oneClickTrading.getAccountPubKeyAndAuthenticators.fetch(
            { userOsmoAddress: walletRepo.current.address! }
          ));
      } catch (error) {
        throw new CreateOneClickSessionError(
          "Failed to fetch account public key and authenticators."
        );
      }

      const key = PrivKeySecp256k1.generateRandomKey();
      const allowedAmount = transaction1CTParams.spendLimit
        .toDec()
        .mul(DecUtils.getTenExponentN(spendLimitTokenDecimals))
        .truncate()
        .toString();
      const allowedMessages: AvailableOneClickTradingMessages[] = [
        "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn",
        "/osmosis.poolmanager.v1beta1.MsgSplitRouteSwapExactAmountIn",
      ];
      const resetPeriod = transaction1CTParams.resetPeriod;

      let sessionPeriod: OneClickTradingTimeLimit;
      switch (transaction1CTParams.sessionPeriod.end) {
        case "10min":
          sessionPeriod = {
            end: unixSecondsToNanoSeconds(dayjs().add(10, "minute").unix()),
          };
          break;
        case "30min":
          sessionPeriod = {
            end: unixSecondsToNanoSeconds(dayjs().add(30, "minute").unix()),
          };
          break;
        case "1hour":
          sessionPeriod = {
            end: unixSecondsToNanoSeconds(dayjs().add(1, "hour").unix()),
          };
          break;
        case "3hours":
          sessionPeriod = {
            end: unixSecondsToNanoSeconds(dayjs().add(3, "hours").unix()),
          };
          break;
        case "12hours":
          sessionPeriod = {
            end: unixSecondsToNanoSeconds(dayjs().add(12, "hours").unix()),
          };
          break;
        default:
          throw new Error(
            `Unsupported time limit: ${transaction1CTParams.sessionPeriod.end}`
          );
      }

      const oneClickTradingAuthenticator =
        getOneClickTradingSessionAuthenticator({
          key,
          allowedAmount,
          allowedMessages,
          resetPeriod,
          sessionPeriod,
        });

      /**
       * If the user has 15 authenticators, remove the oldest AllOfAuthenticator which is are previous OneClickTrading session
       */
      const authenticatorToRemoveId =
        authenticators.length === 15
          ? authenticators
              .filter(({ type }) => type === "AllOfAuthenticator")
              /**
               * Find the oldest AllOfAuthenticator by comparing the id.
               * The smallest id is the oldest authenticator.
               */
              .reduce((min, authenticator) => {
                if (isNil(min)) return authenticator.id;
                return new Dec(authenticator.id).lt(new Dec(min))
                  ? authenticator.id
                  : min;
              }, null as string | null)
          : undefined;

      addAuthenticators.mutate(
        {
          removeAuthenticators: authenticatorToRemoveId
            ? [BigInt(authenticatorToRemoveId)]
            : [],
          addAuthenticators: shouldAddFirstAuthenticator
            ? [
                getFirstAuthenticator({ pubKey: accountPubKey }),
                oneClickTradingAuthenticator,
              ]
            : [oneClickTradingAuthenticator],
        },
        {
          onSuccess: () => {
            accountStore.setOneClickTradingInfo({
              publicKey: toBase64(key.getPubKey().toBytes()),
              privateKey: toBase64(key.toBytes()),
              allowed: allowedAmount,
              allowedMessages,
              resetPeriod,
              sessionPeriod,
              sessionStartedAtUnix: dayjs().unix(),
              networkFeeLimit: transaction1CTParams.networkFeeLimit.toCoin(),
              hasSeenExpiryToast: false,
            });

            setDoNotShowFloatingBannerAgain(true);
            accountStore.setShouldUseOneClickTrading({ nextValue: true });

            const sessionEndDate = dayjs.unix(
              unixNanoSecondsToSeconds(sessionPeriod.end)
            );
            const humanizedTime = humanizeTime(sessionEndDate);
            dismissAllToasts();
            displayToast(
              {
                message: t("oneClickTrading.toast.oneClickTradingActive"),
                caption: `${humanizedTime.value} ${t(
                  humanizedTime.unitTranslationKey
                )} ${t("remaining")}`,
              },
              ToastType.ONE_CLICK_TRADING
            );
          },
        }
      );
    },
    [
      accountStore,
      addAuthenticators,
      apiUtils.edge.oneClickTrading.getAccountPubKeyAndAuthenticators,
      setDoNotShowFloatingBannerAgain,
      t,
    ]
  );

  return { onCreate1CTSession, isLoading: addAuthenticators.isLoading };
};
