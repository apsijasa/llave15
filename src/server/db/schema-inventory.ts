import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { branches, createdAt, instant, updatedAt, users } from "./schema.ts";

export type ProductCategory = "repuesto" | "accesorio" | "insumo" | "bicicleta_usada";
export type StockMovementKind =
  | "compra"
  | "venta"
  | "consumo_orden"
  | "ajuste"
  | "devolucion"
  | "anulacion";

function branchReference() {
  return uuid("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "restrict" });
}

function creatorReference() {
  return uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" });
}

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    name: text("name").notNull(),
    rut: text("rut"),
    phone: text("phone"),
    email: text("email"),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_suppliers_branch_rut").on(t.branchId, t.rut).where(sql`rut is not null`),
    index("idx_suppliers_branch_name").on(t.branchId, t.name),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: text("category").$type<ProductCategory>().notNull(),
    unit: text("unit").notNull().default("unidad"),
    costClp: integer("cost_clp").notNull().default(0),
    priceClp: integer("price_clp").notNull(),
    forSale: boolean("for_sale").notNull().default(true),
    stockQty: integer("stock_qty").notNull().default(0),
    minStock: integer("min_stock").notNull().default(0),
    barcode: text("barcode"),
    serialNumber: text("serial_number"),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: creatorReference(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_products_branch_sku").on(t.branchId, t.sku),
    uniqueIndex("uq_products_branch_barcode")
      .on(t.branchId, t.barcode)
      .where(sql`barcode is not null`),
    index("idx_products_branch_category").on(t.branchId, t.category),
    check("products_stock_qty_check", sql`stock_qty >= 0`),
    check("products_amounts_check", sql`cost_clp >= 0 and price_clp >= 0 and min_stock >= 0`),
    check(
      "products_category_check",
      sql`category in ('repuesto', 'accesorio', 'insumo', 'bicicleta_usada')`,
    ),
    check(
      "products_used_bike_serial_check",
      sql`category <> 'bicicleta_usada' or serial_number is not null`,
    ),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    kind: text("kind").$type<StockMovementKind>().notNull(),
    quantity: integer("quantity").notNull(),
    unitCostClp: integer("unit_cost_clp"),
    referenceKind: text("reference_kind"),
    referenceId: uuid("reference_id"),
    note: text("note"),
    createdBy: creatorReference(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_stock_movements_product_created").on(t.productId, t.createdAt),
    check(
      "stock_movements_kind_check",
      sql`kind in ('compra', 'venta', 'consumo_orden', 'ajuste', 'devolucion', 'anulacion')`,
    ),
    check("stock_movements_quantity_check", sql`quantity <> 0`),
    check(
      "stock_movements_sign_check",
      sql`(kind in ('compra', 'devolucion') and quantity > 0) or (kind in ('venta', 'consumo_orden') and quantity < 0) or kind in ('ajuste', 'anulacion')`,
    ),
    check("stock_movements_unit_cost_check", sql`unit_cost_clp is null or unit_cost_clp >= 0`),
    check(
      "stock_movements_reference_kind_check",
      sql`reference_kind is null or reference_kind in ('purchase_order', 'work_order_item', 'sale', 'sale_refund', 'import')`,
    ),
    check(
      "stock_movements_reference_check",
      sql`(reference_kind is null) = (reference_id is null)`,
    ),
    check("stock_movements_adjustment_note_check", sql`kind <> 'ajuste' or note is not null`),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    status: text("status").notNull().default("borrador"),
    docType: text("doc_type"),
    docNumber: text("doc_number"),
    notes: text("notes"),
    receivedAt: instant("received_at"),
    receivedBy: uuid("received_by").references(() => users.id, { onDelete: "restrict" }),
    voidedAt: instant("voided_at"),
    voidedBy: uuid("voided_by").references(() => users.id, { onDelete: "restrict" }),
    createdBy: creatorReference(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("uq_purchase_orders_branch_number").on(t.branchId, t.number),
    check("purchase_orders_number_check", sql`number >= 1`),
    check(
      "purchase_orders_status_check",
      sql`status in ('borrador', 'enviada', 'recibida', 'anulada')`,
    ),
    check(
      "purchase_orders_doc_type_check",
      sql`doc_type is null or doc_type in ('factura', 'boleta', 'guia')`,
    ),
    check(
      "purchase_orders_received_check",
      sql`status <> 'recibida' or (received_at is not null and received_by is not null)`,
    ),
    check("purchase_orders_voided_check", sql`(status = 'anulada') = (voided_at is not null)`),
  ],
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: branchReference(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitCostClp: integer("unit_cost_clp").notNull(),
    receivedQty: integer("received_qty").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_purchase_order_items_order").on(t.purchaseOrderId),
    check("purchase_order_items_quantity_check", sql`quantity > 0`),
    check("purchase_order_items_unit_cost_check", sql`unit_cost_clp >= 0`),
    check("purchase_order_items_received_qty_check", sql`received_qty between 0 and quantity`),
  ],
);

export const inventoryTables = [
  suppliers,
  products,
  stockMovements,
  purchaseOrders,
  purchaseOrderItems,
] as const;
