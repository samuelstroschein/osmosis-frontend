import { OneClickTradingInfo } from "@osmosis-labs/stores";
import classNames from "classnames";
import { observer } from "mobx-react-lite";
import { useCallback, useState } from "react";
import { toast } from "react-toastify";
import { createGlobalState, useMount } from "react-use";

import { displayToast, ToastType } from "~/components/alert";
import { Button } from "~/components/buttons";
import { IntroducingOneClick } from "~/components/one-click-trading/introducing-one-click-trading";
import OneClickTradingSettings from "~/components/one-click-trading/one-click-trading-settings";
import {
  useOneClickTradingParams,
  useOneClickTradingSession,
  useTranslation,
} from "~/hooks";
import { useCreateOneClickTradingSession } from "~/hooks/mutations/one-click-trading";
import { ModalBase } from "~/modals/base";
import { useStore } from "~/stores";

export const useGlobalIs1CTIntroModalOpen = createGlobalState(false);

const OneClickTradingIntroModal = observer(() => {
  const { accountStore, chainStore } = useStore();
  const { oneClickTradingInfo } = useOneClickTradingSession();

  const [isOpen, setIsOpen] = useGlobalIs1CTIntroModalOpen();
  const [show1CTEditParams, setShow1CTEditParams] = useState(false);
  const [shouldHideSettingsBackButton, setShouldHideSettingsBackButton] =
    useState(false);
  const { t } = useTranslation();

  const create1CTSession = useCreateOneClickTradingSession({
    queryOptions: {
      onSuccess: () => {
        setIsOpen(false);
      },
    },
  });

  const displayExpiredToast = useCallback(() => {
    const toastId = "one-click-trading-expired";
    displayToast(
      {
        message: t("oneClickTrading.toast.oneClickTradingExpired"),
        captionElement: (
          <Button
            mode="text"
            className="caption"
            onClick={() => {
              setIsOpen(true);
              setShow1CTEditParams(true);
              setShouldHideSettingsBackButton(true);
              toast.dismiss(toastId);
            }}
          >
            {t("oneClickTrading.toast.enableOneClickTrading")}
          </Button>
        ),
      },
      ToastType.ONE_CLICK_TRADING,
      {
        toastId, // Provide an id to prevent duplicates
        autoClose: false,
      }
    );
  }, [t, setIsOpen]);

  const on1CTSessionExpire = useCallback(
    ({ oneClickTradingInfo }: { oneClickTradingInfo: OneClickTradingInfo }) => {
      if (oneClickTradingInfo.hasSeenExpiryToast) return;

      accountStore.setOneClickTradingInfo({
        ...oneClickTradingInfo,
        hasSeenExpiryToast: true,
      });

      displayExpiredToast();
    },
    [accountStore, displayExpiredToast]
  );

  /**
   * If the session has expired while the user was not on the page,
   * we need to display the toast when the user comes back.
   */
  useMount(() => {
    const main = async () => {
      const oneClickTradingInfo = await accountStore.getOneClickTradingInfo();
      const isExpired = await accountStore.isOneClickTradingExpired();
      if (
        !isExpired ||
        !oneClickTradingInfo ||
        oneClickTradingInfo?.hasSeenExpiryToast
      )
        return;
      on1CTSessionExpire({ oneClickTradingInfo });
    };
    main();
  });

  useOneClickTradingSession({
    onExpire: on1CTSessionExpire,
  });

  const {
    transaction1CTParams,
    setTransaction1CTParams,
    isLoading: isLoading1CTParams,
    spendLimitTokenDecimals,
    reset: reset1CTParams,
    isError: isError1CTParams,
  } = useOneClickTradingParams({
    oneClickTradingInfo,
  });

  const onClose = () => {
    setIsOpen(false);
    setShow1CTEditParams(false);
    setShouldHideSettingsBackButton(false);
  };

  return (
    <ModalBase
      isOpen={isOpen}
      onRequestClose={onClose}
      className={classNames(show1CTEditParams && "px-0 py-9")}
    >
      <div
        className={classNames(
          "flex items-center",
          show1CTEditParams ? "px-8" : "mx-auto max-w-[31rem]"
        )}
      >
        {show1CTEditParams ? (
          <OneClickTradingSettings
            onGoBack={() => {
              setShow1CTEditParams(false);
            }}
            hideBackButton={shouldHideSettingsBackButton}
            setTransaction1CTParams={setTransaction1CTParams}
            transaction1CTParams={transaction1CTParams!}
            isSendingTx={create1CTSession.isLoading}
            onStartTrading={() => {
              create1CTSession.mutate({
                spendLimitTokenDecimals,
                transaction1CTParams,
                walletRepo: accountStore.getWalletRepo(
                  chainStore.osmosis.chainId
                ),
              });
            }}
          />
        ) : (
          <IntroducingOneClick
            isDisabled={isError1CTParams}
            isLoading={isLoading1CTParams || create1CTSession.isLoading}
            onStartTrading={() => {
              reset1CTParams();
              create1CTSession.mutate({
                spendLimitTokenDecimals,
                transaction1CTParams,
                walletRepo: accountStore.getWalletRepo(
                  chainStore.osmosis.chainId
                ),
              });
            }}
            onClickEditParams={() => {
              setShow1CTEditParams(true);
            }}
          />
        )}
      </div>
    </ModalBase>
  );
});

export default OneClickTradingIntroModal;
