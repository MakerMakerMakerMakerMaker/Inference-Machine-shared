/// <reference types="vite/client" />

declare module "virtual:mkmk-engine";
declare module "virtual:mkmk-news" {
  const news: Record<string, { title: string; text: string }[]>;
  export default news;
}
