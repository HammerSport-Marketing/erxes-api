import { Document, Schema } from 'mongoose';
import { ACTIVITY_CONTENT_TYPES } from './constants';
import { field } from './utils';

export interface IInternalNote {
  contentType: string;
  contentTypeId: string;
  content: string;
  mentionedUserIds?: string[];
}

export interface IInternalNoteDocument extends IInternalNote, Document {
  _id: string;
  createdUserId: string;
  createdDate: Date;
}

// Mongoose schemas =======================

export const internalNoteSchema = new Schema({
  contentType: field({
    type: String,
    enum: ACTIVITY_CONTENT_TYPES.ALL,
  }),
  contentTypeId: field({ type: String }),
  content: field({
    type: String,
  }),
  createdUserId: field({
    type: String,
  }),
  createdDate: field({
    type: Date,
  }),
});
