type BookingShop = {
  slug: string;
  name: string;
  addressShort: string;
  email?: string;
  pickupEnabled: boolean;
  pickupComunas: string[];
  pickupFeeClp: number;
  horizonDays: number;
  blockMinutes: number;
  codePrefix: string;
  privacyHref: string;
};

const identity = {
  name: "Vector Bikes",
  url: "https://vectorbikes.cl",
  logoPath: "/brand/vector-bikes-logo.png",
  certifications: [] as const as readonly string[],
  streetAddress: "Avenida Kennedy 7666",
  addressShort: "Av. Kennedy 7666, Vitacura",
  locality: "Vitacura",
  region: "Región Metropolitana",
  country: "CL",
  email: "info@vectorbikes.cl",
  phone: "+56985095780",
  phoneDisplay: "+56 9 8509 5780",
  instagramUrl: "https://instagram.com/vector.bikes",
  instagramHandle: "@vector.bikes",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Avenida+Kennedy+7666+Vitacura",
} as const;

// Misma forma que la isla, sin depender del código de la plataforma.
const islandShop: BookingShop = {
  slug: "vector-bikes",
  name: identity.name,
  addressShort: identity.addressShort,
  pickupEnabled: true,
  pickupComunas: ["Vitacura", "Las Condes"],
  pickupFeeClp: 15000,
  horizonDays: 14,
  blockMinutes: 30,
  codePrefix: "VB",
  privacyHref: "/privacidad",
  email: identity.email,
};

export type BikeTypeKey = "mtb" | "ruta" | "gravel" | "urbana" | "ebike";

export type ServicePrice = {
  name: string;
  /** Precio en pesos chilenos por tipo de bicicleta; sin valor, la página muestra "Consultar". */
  prices: Partial<Record<BikeTypeKey, number>>;
};

export const BIKE_TYPES: readonly { key: BikeTypeKey; label: string }[] = [
  { key: "mtb", label: "MTB" },
  { key: "ruta", label: "Ruta" },
  { key: "gravel", label: "Gravel" },
  { key: "urbana", label: "Urbana" },
  { key: "ebike", label: "E-bike" },
];

// Copia del catálogo de /taller/catalogo (22-11-2026). Si cambia un precio allá, se cambia aquí.
export const SERVICE_PRICES: readonly ServicePrice[] = [
  { name: "Mantención básica de shock", prices: {} },
  { name: "Mantención full de shock", prices: {} },
  { name: "Mantención full de horquilla", prices: {} },
  {
    name: "Relleno de líquido tubeless",
    prices: { mtb: 15000, ruta: 10000, gravel: 10000, urbana: 10000, ebike: 15000 },
  },
  { name: "Servicio básico de horquilla", prices: { mtb: 35000 } },
  {
    name: "Servicio básico medio",
    prices: { mtb: 54900, ruta: 54900, gravel: 54900, urbana: 54900 },
  },
  { name: "Servicio full", prices: { mtb: 77500, ruta: 77500, gravel: 77500 } },
  {
    name: "Servicio de mantención básica",
    prices: { mtb: 33283, ruta: 33283, gravel: 33283, urbana: 33283 },
  },
];

export const VECTOR_BIKES_SITE = {
  ...identity,
  heroLabel: "Taller de bicicletas · Vitacura",
  addressCity: "Vitacura, Santiago",
  pickupComunas: islandShop.pickupComunas,
  islandShop,
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "15:00",
      closes: "20:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Saturday"],
      opens: "10:00",
      closes: "14:00",
    },
  ],
  receptionHours: {
    weekdays: { from: 15 * 60, to: 20 * 60, range: "15:00 – 20:00" },
    saturday: { from: 10 * 60, to: 14 * 60, range: "10:00 – 14:00" },
  },
  bookingDescription:
    "Recibimos bicicletas de lunes a viernes de 15:00 a 20:00 y los sábados de 10:00 a 14:00. El retiro a domicilio parte a las 09:00 de lunes a viernes. Puedes reservar desde dos horas antes y hasta 30 días adelante.",
  blockDescription:
    "Bloques de 30 minutos. Nos cuentas qué le pasa a tu bici o qué quieres hacerle.",
  pickupDuration: "Ocupa 1 hora de agenda (2 bloques)",
  faq: [
    {
      q: "¿Qué pasa si encuentran un problema extra?",
      a: "Te llamamos antes de hacer cualquier trabajo que no estaba en tu descripción. Te explicamos qué encontramos y cuál es la solución; algunas no tienen costo extra y otras sí. Tú decides.",
    },
    {
      q: "¿Cómo pago?",
      a: "En efectivo, por transferencia o con tarjeta, al momento de recibir tu bicicleta. En los retiros a domicilio llevamos POS.",
    },
    {
      q: "¿Puedo cambiar o cancelar mi hora?",
      a: "Sí. En el correo de confirmación viene un enlace para cancelar. Si quieres otro horario, cancela y reserva de nuevo.",
    },
    {
      q: "¿Hasta dónde llega el retiro a domicilio?",
      a: "Vitacura y Las Condes. Los $15.000 incluyen ir a buscar y devolver tu bicicleta.",
    },
    {
      q: "¿Atienden domingos y feriados?",
      a: "No. El sitio bloquea automáticamente los feriados, como el 18 y 19 de septiembre.",
    },
  ],
  home: {
    title: "Taller de bicicletas en Vitacura | Mecánica Vector Bikes",
    description:
      "Taller de mecánica de bicicletas de precisión en Av. Kennedy 7666, Vitacura. Reserva tu hora en línea: la dejas en el taller o te la vamos a buscar.",
  },
  services: {
    title: "Servicios y precios | Taller de bicicletas Vector Bikes, Vitacura",
    description:
      "Precios de mantención y servicios para bicicletas MTB, ruta, gravel, urbanas y e-bike en Vector Bikes, Av. Kennedy 7666, Vitacura.",
  },
  privacy: {
    title: "Aviso de privacidad — Vector Bikes",
    description: "Cómo Vector Bikes usa los datos de tu reserva y cómo ejercer tus derechos.",
  },
  privacyNotice:
    "Usamos tus datos solo para gestionar tu reserva y contactarte sobre tu bicicleta. Escríbenos a info@vectorbikes.cl para revisarlos o eliminarlos.",
} as const;

export const BOOKING_URL = "https://llave15.cl/vector-bikes/reservar";
