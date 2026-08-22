declare module 'qrcode-terminal' {
  interface QRCodeOptions {
    small?: boolean;
  }
  const qrcode: {
    generate(text: string, options?: QRCodeOptions): void;
  };
  export default qrcode;
}
