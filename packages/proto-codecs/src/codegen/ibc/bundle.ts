//@ts-nocheck
import * as _0 from "./applications/transfer/v1/genesis";
import * as _1 from "./applications/transfer/v1/transfer";
import * as _2 from "./applications/transfer/v1/tx";
import * as _84 from "./applications/transfer/v1/tx.amino";
import * as _86 from "./applications/transfer/v1/tx.registry";
import * as _3 from "./applications/transfer/v2/packet";
import * as _4 from "./core/client/v1/client";
import * as _5 from "./core/client/v1/genesis";
import * as _6 from "./core/client/v1/tx";
import * as _85 from "./core/client/v1/tx.amino";
import * as _87 from "./core/client/v1/tx.registry";
export namespace ibc {
  export namespace applications {
    export namespace transfer {
      export const v1 = {
        ..._0,
        ..._1,
        ..._2,
        ..._84,
        ..._86,
      };
      export const v2 = {
        ..._3,
      };
    }
  }
  export namespace core {
    export namespace client {
      export const v1 = {
        ..._4,
        ..._5,
        ..._6,
        ..._85,
        ..._87,
      };
    }
  }
}
