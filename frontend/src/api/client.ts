/** The one API client. The backend address comes from VITE_API_BASE_URL (see .env.example). */
import { useAuthStore } from "@/stores/auth";
import { HttpApi } from "./http/HttpApi";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1").replace(/\/$/, "");
/** ws://host/api/v1/ws, derived from the API address. */
export const WS_URL = `${API_BASE_URL.replace(/^http/, "ws")}/ws`;

export const api = new HttpApi(API_BASE_URL, () => useAuthStore.getState().token);
