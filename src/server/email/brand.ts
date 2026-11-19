import { PLATFORM } from "../../lib/platform.ts";
import type { ShopProfile } from "../shops/profile.ts";

/** Marca de un correo al cliente: el taller por dentro, Llave 15 en el pie (BG-17). */
export type EmailBrand = {
  shopName: string;
  replyTo: string;
  notifyEmail: string;
  phoneDisplay: string;
  addressShort: string;
  logoPath: string | null;
  footerLine: string;
};

export function emailBrand(profile: ShopProfile): EmailBrand {
  return {
    shopName: profile.name,
    replyTo: profile.email,
    notifyEmail: profile.notifyEmail,
    phoneDisplay: profile.phoneDisplay,
    addressShort: profile.addressShort,
    logoPath: profile.logoPath,
    footerLine: PLATFORM.footerLine,
  };
}

/** Dirección de `EMAIL_FROM`: lo que va entre `<>`, o el valor completo si no hay. */
function senderAddress(emailFrom: string): string {
  const match = /<([^<>]+)>/.exec(emailFrom);
  return (match?.[1] ?? emailFrom).trim();
}

/** `<Taller> · Llave 15 <dirección>`: el nombre del taller con la dirección de envío. */
export function senderFor(profile: ShopProfile, emailFrom: string): string {
  return `${profile.name} · ${PLATFORM.name} <${senderAddress(emailFrom)}>`;
}
