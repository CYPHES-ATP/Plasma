import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import { described } from "./metadata"

export class ApiPlasmaError extends Schema.ErrorClass<ApiPlasmaError>("PlasmaError")(
  {
    name: Schema.Literal("PlasmaError"),
    data: Schema.Struct({
      message: Schema.String,
    }),
  },
  { httpApiStatus: 400 },
) {}

const StatusQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  target: Schema.optional(Schema.Literals(["local", "sepolia"])),
})

const DeployPayload = Schema.Struct({
  contract: Schema.optional(Schema.String),
  args: Schema.optional(Schema.Array(Schema.Unknown)),
})

const root = "/plasma"

export const PlasmaApi = HttpApi.make("plasma").add(
  HttpApiGroup.make("plasma")
    .add(
      HttpApiEndpoint.get("status", `${root}/status`, {
        query: StatusQuery,
        success: described(Schema.Unknown, "Plasma compile, audit, gate, and deployment state"),
        error: ApiPlasmaError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plasma.status",
          summary: "Get Plasma security status",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("initialize", `${root}/new`, {
        query: WorkspaceRoutingQuery,
        success: described(Schema.Unknown, "Initialized Solidity project"),
        error: ApiPlasmaError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plasma.new",
          summary: "Initialize a secure Solidity project",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("compile", `${root}/compile`, {
        query: WorkspaceRoutingQuery,
        success: described(Schema.Unknown, "Solidity build result"),
        error: ApiPlasmaError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plasma.compile",
          summary: "Compile Solidity with Standard JSON",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("audit", `${root}/audit`, {
        query: WorkspaceRoutingQuery,
        success: described(Schema.Unknown, "Fingerprint-bound reentrancy audit"),
        error: ApiPlasmaError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plasma.audit",
          summary: "Run the focused reentrancy audit",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("deployLocal", `${root}/deploy/local`, {
        query: WorkspaceRoutingQuery,
        payload: DeployPayload,
        success: described(Schema.Unknown, "Anvil deployment result"),
        error: ApiPlasmaError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plasma.deploy.local",
          summary: "Deploy the exact audited artifact to Anvil",
        }),
      ),
    )
    .add(
      HttpApiEndpoint.post("prepareSepolia", `${root}/deploy/sepolia`, {
        query: WorkspaceRoutingQuery,
        payload: DeployPayload,
        success: described(Schema.Unknown, "Sepolia external signing request"),
        error: ApiPlasmaError,
      }).annotateMerge(
        OpenApi.annotations({
          identifier: "plasma.deploy.sepolia",
          summary: "Prepare the exact audited artifact for safe Sepolia signing",
        }),
      ),
    )
    .middleware(InstanceContextMiddleware)
    .middleware(WorkspaceRoutingMiddleware)
    .middleware(Authorization),
)
