/**
 * The single switch between mock and live data: VITE_API_MODE=mock|live (see .env.example).
 */
import { useAuthStore } from "@/stores/auth";
import { HttpApi } from "./http/HttpApi";
import { MockApi } from "./mock/MockApi";
import type { ApiMode, SafeRouteApi } from "./SafeRouteApi";

const mode: ApiMode = import.meta.env.VITE_API_MODE === "live" ? "live" : "mock";
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
const getToken = () => useAuthStore.getState().token;

export const api: SafeRouteApi = mode === "live" ? new HttpApi(baseUrl, getToken) : new MockApi(getToken);
export const apiMode = mode;
