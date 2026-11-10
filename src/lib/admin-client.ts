"use client";
import { api, ApiError } from "./client";
export const ADMIN_ACCESS_LOST = "lisi:admin-access-lost";
export const adminApi: typeof api = async (path, payload, options) => {
  try {
    return await api(path, payload, options);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 401 &&
      !options?.signal?.aborted
    )
      window.dispatchEvent(new Event(ADMIN_ACCESS_LOST));
    throw error;
  }
};
