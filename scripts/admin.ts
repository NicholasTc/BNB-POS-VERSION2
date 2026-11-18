import { runProvisioning, provisioningFailed } from "./provision-identity";
await runProvisioning("admin").catch(provisioningFailed);
