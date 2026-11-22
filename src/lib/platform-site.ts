/**
 * Textos de la landing de Llave 15 (`llave15.cl/`, `/demo`, `/aviso-de-privacidad`).
 * Sin datos de ningún taller (regla 14): la landing habla del producto.
 */
export const PLATFORM_SITE = {
  title: "Llave 15 — Software de gestión para talleres de bicicletas",
  description:
    "Reservas en línea, recepción en tablet, órdenes de trabajo, aprobación del cliente, inventario y caja para talleres de bicicletas.",
  tagline: "Cada bicicleta, del ingreso a la entrega.",
  lead: "Llave 15 reúne agenda, órdenes, fichas de bicicletas e inventario para que tu taller sepa qué está pasando con cada trabajo y qué acción corresponde.",
  nav: [
    { href: "/#funciones", label: "Funciones" },
    { href: "/#como-funciona", label: "Cómo funciona" },
    { href: "/#preguntas", label: "Preguntas" },
  ],
  features: [
    {
      title: "Reservas en línea",
      body: "Cada taller tiene su página de reservas con sus horarios, su capacidad diaria y retiro a domicilio. El botón se enlaza desde tu sitio o tu Instagram.",
    },
    {
      title: "Recepción en tablet",
      body: "Cliente, bicicleta, checklist de ingreso, fotos y firma en la misma pantalla, pensada para usarse en el banco de trabajo.",
    },
    {
      title: "Órdenes y aprobación",
      body: "Diagnóstico, repuestos y mano de obra en la orden. Si aparece un trabajo adicional, el cliente lo aprueba desde un enlace.",
    },
    {
      title: "Seguimiento para el cliente",
      body: "Tu cliente ve el estado de su bicicleta, recibe el aviso de retiro y un informe del servicio con la marca de tu taller.",
    },
    {
      title: "Inventario, caja y mostrador",
      body: "Stock con movimientos, compras a proveedores, gastos, ventas de mostrador y cuadre de caja diario.",
    },
    {
      title: "Biblioteca técnica",
      body: "Procedimientos, compatibilidades y fichas de componentes para consultar mientras trabajas en la bicicleta.",
    },
  ],
  steps: [
    {
      title: "Solicitas una demo",
      body: "Nos cuentas cómo trabaja tu taller y te mostramos el sistema con datos de ejemplo.",
    },
    {
      title: "Configuramos tu taller",
      body: "Cargamos tu perfil, horarios y el catálogo base de servicios, y creamos los usuarios de tu equipo.",
    },
    {
      title: "Empiezas a recibir bicicletas",
      body: "Tu equipo registra la primera recepción y tus clientes ya pueden reservar en línea.",
    },
  ],
  audiences: [
    {
      title: "Dueño o administrador",
      body: "Ve la carga del taller, los montos, la caja y los indicadores sin perseguir a nadie.",
    },
    {
      title: "Mecánico",
      body: "Abre su orden, marca el avance y consulta la biblioteca sin ver datos que no necesita.",
    },
    {
      title: "Cliente del taller",
      body: "Reserva, aprueba presupuestos y sabe cuándo retirar su bicicleta, todo desde el teléfono.",
    },
  ],
  faq: [
    {
      q: "¿Hay que instalar algo?",
      a: "No. Llave 15 funciona en el navegador del computador, la tablet o el teléfono.",
    },
    {
      q: "¿Funciona en tablet?",
      a: "Sí. La recepción, el control de calidad, la venta de mostrador y la caja están diseñadas primero para tablet.",
    },
    {
      q: "¿Quién ve los datos de mis clientes?",
      a: "Solo el personal de tu taller. Cada taller tiene sus datos separados y nadie de otro taller puede verlos.",
    },
    {
      q: "¿Cuánto cuesta?",
      a: "Solicita una demo y te contamos los planes según el tamaño de tu taller.",
    },
    {
      q: "¿Sirve con mi sitio web actual?",
      a: "Sí. Tu sitio sigue igual y el botón «Reservar» lleva a la página de reservas de tu taller en Llave 15.",
    },
  ],
  demo: {
    title: "Solicitar una demo — Llave 15",
    description: "Cuéntanos de tu taller y coordinamos una demo de Llave 15.",
    heading: "Solicita una demo",
    lead: "Déjanos tus datos y te contactamos para mostrarte Llave 15 y contarte los planes.",
    sent: "Recibimos tu solicitud. Te escribimos en los próximos días hábiles.",
  },
  privacy: {
    title: "Aviso de privacidad — Llave 15",
    description: "Cómo trata Llave 15 los datos del formulario de solicitud de demo.",
  },
} as const;
