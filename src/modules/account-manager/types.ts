import { z } from "zod";
export const newOwnerInput = z
  .object({
    operationId: z.uuid(),
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    password: z.string().min(12).max(128),
    adminPassword: z.string().min(1).max(128),
  })
  .strict();
export type OwnerSummary = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};
export type OwnerList = {
  owners: OwnerSummary[];
  total: number;
  page: number;
  pageSize: number;
};
