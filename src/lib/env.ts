// Runtime-safe VITE env loader/validator
import { z } from "zod";

// Only expose client-safe variables (VITE_*)
const EnvSchema = z.object({
  VITE_API_BASE_URL: z
    .string()
    .trim()
    // Accept absolute URLs or "/api" style relative base for dev proxy
    .refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//.test(v), {
      message: "VITE_API_BASE_URL must be an absolute URL or a relative base like /api",
    })
    .default(""),
  VITE_STORAGE_PROVIDER: z
    .enum(["local", "s3", "gdrive"]) // display-only on FE
    .default("local"),
  VITE_UPLOAD_MAX_MB: z
    .string()
    .regex(/^\d+$/, "VITE_UPLOAD_MAX_MB must be an integer (MB)")
    .transform((v) => parseInt(v, 10))
    .default("50"),
  VITE_FEATURE_UPLOAD: z
    .string()
    .transform((v) => v === "true")
    .default("true"),
});

// Read from import.meta.env (Vite)
const raw = {
  VITE_API_BASE_URL: (import.meta as any).env?.VITE_API_BASE_URL ?? "",
  VITE_STORAGE_PROVIDER: (import.meta as any).env?.VITE_STORAGE_PROVIDER ?? "local",
  VITE_UPLOAD_MAX_MB: (import.meta as any).env?.VITE_UPLOAD_MAX_MB ?? "50",
  VITE_FEATURE_UPLOAD: (import.meta as any).env?.VITE_FEATURE_UPLOAD ?? "true",
};

const parsed = EnvSchema.safeParse(raw);

if (!parsed.success) {
  // Build-time or runtime: throw for visibility
  const issues = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = parsed.data;
