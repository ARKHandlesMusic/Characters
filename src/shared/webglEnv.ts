// Detects CPU software WebGL rasterizers (SwiftShader / llvmpipe / softpipe) so Remotion Studio
// preview stays responsive while GPU browsers and real Remotion renders always use full native 4K.

let cachedSoftwareGl: boolean | null = null;

export function detectSoftwareGl(): boolean {
  if (cachedSoftwareGl !== null) return cachedSoftwareGl;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) {
      cachedSoftwareGl = false;
      return false;
    }
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg
      ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "")
      : String(gl.getParameter(gl.RENDERER) ?? "");
    const isSoft = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(renderer);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    cachedSoftwareGl = isSoft;
    return isSoft;
  } catch {
    cachedSoftwareGl = false;
    return false;
  }
}
