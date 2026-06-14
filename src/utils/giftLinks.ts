// KELDARI-UI: единая сборка шаринг-ссылок на подарок.
//
// Бэкенд отдаёт владельцу 32-символьный префикс токена (cabinet/routes/gift.py
// ::_GIFT_SHARE_TOKEN_LEN). Из него строим две ссылки:
//   • Telegram deep-link  → бот активирует подарок (start.py, обработчик GIFT_);
//   • ссылка на сайт      → страница /buy/gift/:token (GiftClaim) активирует по email.
// Обе ищут подарок по префиксу токена (startswith), поэтому полный токен не нужен.

export interface GiftLinks {
  /** Telegram deep-link, либо null если неизвестен username бота. */
  telegram: string | null;
  /** Ссылка на страницу активации на сайте. */
  site: string;
}

export function buildGiftLinks(shareToken: string, botUsername: string): GiftLinks {
  const telegram = botUsername
    ? `https://t.me/${botUsername}?start=GIFT_${shareToken}`
    : null;
  const site = `${window.location.origin}/buy/gift/${shareToken}`;
  return { telegram, site };
}
