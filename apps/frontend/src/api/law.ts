import { api } from "./client";

/** A taggable EPC provision for the `/` picker — mirrors @patrick/law's ProvisionRef. */
export type ProvisionRef = {
	key: string;
	cite: string;
	name: string | null;
	kind: string;
};

export const lawApi = {
	provisions: () => api.get<{ provisions: ProvisionRef[] }>("/law/provisions"),
};
