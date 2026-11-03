/* The public page the share buttons post and copy. */
export const SHARE_URL = "https://makermaker.ai/breakthroughs/inference/simulation";

/* Copies text for the share buttons; resolves true once it is on the clipboard.
   Without clipboard access the text goes in a prompt to copy by hand. */
export function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(
      () => true,
      () => {
        window.prompt("copy:", text);
        return false;
      }
    );
  }
  window.prompt("copy:", text);
  return Promise.resolve(false);
}
