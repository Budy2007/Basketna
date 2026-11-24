// One dated price seen at one shop. The log is append-only: a wrong price is fixed by a new observation,
// never by editing.
import mongoose from 'mongoose';
import { ISO_DATE, SOURCES } from './constants.js';

const observationSchema = new mongoose.Schema({
  staple: { type: String, required: true, index: true },
  shop: { type: String, required: true, index: true },
  productTitle: String,
  packSize: { type: Number, required: true, min: 1e-9 }, // in the staple's unit
  packPriceEgp: { type: Number, required: true, min: 0.01 },
  unitPriceEgp: { type: Number, required: true },
  isPromo: { type: Boolean, default: false },
  observedOn: { type: String, required: true, match: ISO_DATE },
  source: { type: String, enum: SOURCES, required: true },
  sourceUrl: String,
  collector: String,
  notes: String,
}, { timestamps: { createdAt: true, updatedAt: false } });

const refuse = function () { throw new Error('price observations are append-only'); };
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  observationSchema.pre(op, refuse);
}

// Query middleware alone does not protect a document loaded with findById() and then saved.
// Existing observations must never be changed through document.save() or document.deleteOne().
observationSchema.pre('save', function () {
  if (!this.isNew) refuse();
});
observationSchema.pre('deleteOne', { document: true, query: false }, refuse);

export const PriceObservation = mongoose.model('PriceObservation', observationSchema);
