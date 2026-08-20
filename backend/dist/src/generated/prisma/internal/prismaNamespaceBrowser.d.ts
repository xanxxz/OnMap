import * as runtime from "@prisma/client/runtime/index-browser";
export type * from '../models.js';
export type * from './prismaNamespace.js';
export declare const Decimal: typeof runtime.Decimal;
export declare const NullTypes: {
    DbNull: (new (secret: never) => typeof runtime.DbNull);
    JsonNull: (new (secret: never) => typeof runtime.JsonNull);
    AnyNull: (new (secret: never) => typeof runtime.AnyNull);
};
export declare const DbNull: import("@prisma/client-runtime-utils").DbNullClass;
export declare const JsonNull: import("@prisma/client-runtime-utils").JsonNullClass;
export declare const AnyNull: import("@prisma/client-runtime-utils").AnyNullClass;
export declare const ModelName: {
    readonly RoadEvent: "RoadEvent";
    readonly RoadEventFeedback: "RoadEventFeedback";
};
export type ModelName = (typeof ModelName)[keyof typeof ModelName];
export declare const TransactionIsolationLevel: {
    readonly ReadUncommitted: "ReadUncommitted";
    readonly ReadCommitted: "ReadCommitted";
    readonly RepeatableRead: "RepeatableRead";
    readonly Serializable: "Serializable";
};
export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel];
export declare const RoadEventScalarFieldEnum: {
    readonly id: "id";
    readonly cityId: "cityId";
    readonly type: "type";
    readonly status: "status";
    readonly title: "title";
    readonly description: "description";
    readonly longitude: "longitude";
    readonly latitude: "latitude";
    readonly createdByInstallationId: "createdByInstallationId";
    readonly confirmationCount: "confirmationCount";
    readonly rejectionCount: "rejectionCount";
    readonly lastConfirmedAt: "lastConfirmedAt";
    readonly confidence: "confidence";
    readonly createdAt: "createdAt";
    readonly updatedAt: "updatedAt";
    readonly expiresAt: "expiresAt";
};
export type RoadEventScalarFieldEnum = (typeof RoadEventScalarFieldEnum)[keyof typeof RoadEventScalarFieldEnum];
export declare const RoadEventFeedbackScalarFieldEnum: {
    readonly id: "id";
    readonly roadEventId: "roadEventId";
    readonly installationId: "installationId";
    readonly action: "action";
    readonly createdAt: "createdAt";
};
export type RoadEventFeedbackScalarFieldEnum = (typeof RoadEventFeedbackScalarFieldEnum)[keyof typeof RoadEventFeedbackScalarFieldEnum];
export declare const SortOrder: {
    readonly asc: "asc";
    readonly desc: "desc";
};
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];
export declare const QueryMode: {
    readonly default: "default";
    readonly insensitive: "insensitive";
};
export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode];
export declare const NullsOrder: {
    readonly first: "first";
    readonly last: "last";
};
export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder];
