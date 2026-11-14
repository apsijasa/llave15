import { z } from "zod";

const photoSchema = z.strictObject({ photoId: z.uuid(), thumbKey: z.string() });
const nullableText = z.string().nullable();
export const snapshotSchema = z.strictObject({
  version: z.literal(1),
  orderNumber: z.string(),
  customerFirstName: z.string(),
  bike: z.strictObject({
    brand: z.string(),
    model: z.string(),
    year: z.number().int().nullable(),
    type: z.string(),
    size: nullableText,
    color: nullableText,
    serialNumber: nullableText,
    kmNoted: z.number().int().nullable(),
  }),
  receivedAt: z.iso.datetime().nullable(),
  deliveredAt: z.iso.datetime().nullable(),
  diagnosis: nullableText,
  workDone: z.array(z.strictObject({ description: z.string(), quantity: z.number().int() })),
  problemsFound: z.array(
    z.strictObject({
      item: z.string(),
      result: z.enum(["revisar", "malo"]),
      note: nullableText,
    }),
  ),
  componentsReplaced: z.array(
    z.strictObject({
      componentType: z.string(),
      brand: z.string(),
      model: z.string(),
      replaces: nullableText,
    }),
  ),
  photosBefore: z.array(photoSchema),
  photosAfter: z.array(photoSchema),
  recommendations: z.string(),
  nextChecks: z.string(),
  rejectedWork: z.array(
    z.strictObject({
      description: z.string(),
      recommendation: z.string(),
      decidedAt: z.iso.datetime(),
    }),
  ),
  totalClp: z.number().int(),
  subtotalClp: z.number().int().optional(),
  vatClp: z.number().int().optional(),
  vatRatePercent: z.number().int().optional(),
});
export type ReportSnapshot = z.infer<typeof snapshotSchema>;
