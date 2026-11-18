import { runProvisioning, provisioningFailed } from "./provision-identity";
await runProvisioning("owner").catch(provisioningFailed);
