import { z } from "zod";
import { db } from "@/db";
import { employee } from "@/db/schema";
export const employeeInput = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(80),
    pin: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    active: z.boolean(),
  })
  .strict();
export async function listEmployees() {
  return db
    .select({ id: employee.id, name: employee.name, active: employee.active })
    .from(employee)
    .orderBy(employee.createdAt);
}
