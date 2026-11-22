declare module "jsqr" {
  type QRCode = { data: string; location?: unknown };
  type Options = { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" };
  function jsQR(data: Uint8ClampedArray, width: number, height: number, options?: Options): QRCode | null;
  export default jsQR;
}
