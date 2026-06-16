import type { ProvisionRef } from "@patrick/shared";
import { api } from "./client";

export const lawApi = {
	provisions: () => api.get<{ provisions: ProvisionRef[] }>("/law/provisions"),
};
