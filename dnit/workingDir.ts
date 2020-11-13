/**
 *  With user project dir setup as:
 *  repo/
 *    dnit/
 *      main.ts
 *    typescript/
 *      hx-terraform
 *
 *  dnit tool changes dir before executing main.ts such that Deno.cwd() is at root of the user project repo.
 */
export const ROOT = Deno.cwd();
