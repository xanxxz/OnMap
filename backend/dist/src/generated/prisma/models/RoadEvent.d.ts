import type * as runtime from "@prisma/client/runtime/client";
import type * as $Enums from "../enums.js";
import type * as Prisma from "../internal/prismaNamespace.js";
export type RoadEventModel = runtime.Types.Result.DefaultSelection<Prisma.$RoadEventPayload>;
export type AggregateRoadEvent = {
    _count: RoadEventCountAggregateOutputType | null;
    _avg: RoadEventAvgAggregateOutputType | null;
    _sum: RoadEventSumAggregateOutputType | null;
    _min: RoadEventMinAggregateOutputType | null;
    _max: RoadEventMaxAggregateOutputType | null;
};
export type RoadEventAvgAggregateOutputType = {
    longitude: number | null;
    latitude: number | null;
    confirmationCount: number | null;
    rejectionCount: number | null;
    confidence: number | null;
};
export type RoadEventSumAggregateOutputType = {
    longitude: number | null;
    latitude: number | null;
    confirmationCount: number | null;
    rejectionCount: number | null;
    confidence: number | null;
};
export type RoadEventMinAggregateOutputType = {
    id: string | null;
    cityId: string | null;
    type: $Enums.RoadEventType | null;
    status: $Enums.RoadEventStatus | null;
    title: string | null;
    description: string | null;
    longitude: number | null;
    latitude: number | null;
    createdByInstallationId: string | null;
    confirmationCount: number | null;
    rejectionCount: number | null;
    lastConfirmedAt: Date | null;
    confidence: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    expiresAt: Date | null;
};
export type RoadEventMaxAggregateOutputType = {
    id: string | null;
    cityId: string | null;
    type: $Enums.RoadEventType | null;
    status: $Enums.RoadEventStatus | null;
    title: string | null;
    description: string | null;
    longitude: number | null;
    latitude: number | null;
    createdByInstallationId: string | null;
    confirmationCount: number | null;
    rejectionCount: number | null;
    lastConfirmedAt: Date | null;
    confidence: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
    expiresAt: Date | null;
};
export type RoadEventCountAggregateOutputType = {
    id: number;
    cityId: number;
    type: number;
    status: number;
    title: number;
    description: number;
    longitude: number;
    latitude: number;
    createdByInstallationId: number;
    confirmationCount: number;
    rejectionCount: number;
    lastConfirmedAt: number;
    confidence: number;
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    _all: number;
};
export type RoadEventAvgAggregateInputType = {
    longitude?: true;
    latitude?: true;
    confirmationCount?: true;
    rejectionCount?: true;
    confidence?: true;
};
export type RoadEventSumAggregateInputType = {
    longitude?: true;
    latitude?: true;
    confirmationCount?: true;
    rejectionCount?: true;
    confidence?: true;
};
export type RoadEventMinAggregateInputType = {
    id?: true;
    cityId?: true;
    type?: true;
    status?: true;
    title?: true;
    description?: true;
    longitude?: true;
    latitude?: true;
    createdByInstallationId?: true;
    confirmationCount?: true;
    rejectionCount?: true;
    lastConfirmedAt?: true;
    confidence?: true;
    createdAt?: true;
    updatedAt?: true;
    expiresAt?: true;
};
export type RoadEventMaxAggregateInputType = {
    id?: true;
    cityId?: true;
    type?: true;
    status?: true;
    title?: true;
    description?: true;
    longitude?: true;
    latitude?: true;
    createdByInstallationId?: true;
    confirmationCount?: true;
    rejectionCount?: true;
    lastConfirmedAt?: true;
    confidence?: true;
    createdAt?: true;
    updatedAt?: true;
    expiresAt?: true;
};
export type RoadEventCountAggregateInputType = {
    id?: true;
    cityId?: true;
    type?: true;
    status?: true;
    title?: true;
    description?: true;
    longitude?: true;
    latitude?: true;
    createdByInstallationId?: true;
    confirmationCount?: true;
    rejectionCount?: true;
    lastConfirmedAt?: true;
    confidence?: true;
    createdAt?: true;
    updatedAt?: true;
    expiresAt?: true;
    _all?: true;
};
export type RoadEventAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.RoadEventWhereInput;
    orderBy?: Prisma.RoadEventOrderByWithRelationInput | Prisma.RoadEventOrderByWithRelationInput[];
    cursor?: Prisma.RoadEventWhereUniqueInput;
    take?: number;
    skip?: number;
    _count?: true | RoadEventCountAggregateInputType;
    _avg?: RoadEventAvgAggregateInputType;
    _sum?: RoadEventSumAggregateInputType;
    _min?: RoadEventMinAggregateInputType;
    _max?: RoadEventMaxAggregateInputType;
};
export type GetRoadEventAggregateType<T extends RoadEventAggregateArgs> = {
    [P in keyof T & keyof AggregateRoadEvent]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateRoadEvent[P]> : Prisma.GetScalarType<T[P], AggregateRoadEvent[P]>;
};
export type RoadEventGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.RoadEventWhereInput;
    orderBy?: Prisma.RoadEventOrderByWithAggregationInput | Prisma.RoadEventOrderByWithAggregationInput[];
    by: Prisma.RoadEventScalarFieldEnum[] | Prisma.RoadEventScalarFieldEnum;
    having?: Prisma.RoadEventScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: RoadEventCountAggregateInputType | true;
    _avg?: RoadEventAvgAggregateInputType;
    _sum?: RoadEventSumAggregateInputType;
    _min?: RoadEventMinAggregateInputType;
    _max?: RoadEventMaxAggregateInputType;
};
export type RoadEventGroupByOutputType = {
    id: string;
    cityId: string;
    type: $Enums.RoadEventType;
    status: $Enums.RoadEventStatus;
    title: string;
    description: string | null;
    longitude: number;
    latitude: number;
    createdByInstallationId: string | null;
    confirmationCount: number;
    rejectionCount: number;
    lastConfirmedAt: Date | null;
    confidence: number;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
    _count: RoadEventCountAggregateOutputType | null;
    _avg: RoadEventAvgAggregateOutputType | null;
    _sum: RoadEventSumAggregateOutputType | null;
    _min: RoadEventMinAggregateOutputType | null;
    _max: RoadEventMaxAggregateOutputType | null;
};
export type GetRoadEventGroupByPayload<T extends RoadEventGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<RoadEventGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof RoadEventGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], RoadEventGroupByOutputType[P]> : Prisma.GetScalarType<T[P], RoadEventGroupByOutputType[P]>;
}>>;
export type RoadEventWhereInput = {
    AND?: Prisma.RoadEventWhereInput | Prisma.RoadEventWhereInput[];
    OR?: Prisma.RoadEventWhereInput[];
    NOT?: Prisma.RoadEventWhereInput | Prisma.RoadEventWhereInput[];
    id?: Prisma.UuidFilter<"RoadEvent"> | string;
    cityId?: Prisma.StringFilter<"RoadEvent"> | string;
    type?: Prisma.EnumRoadEventTypeFilter<"RoadEvent"> | $Enums.RoadEventType;
    status?: Prisma.EnumRoadEventStatusFilter<"RoadEvent"> | $Enums.RoadEventStatus;
    title?: Prisma.StringFilter<"RoadEvent"> | string;
    description?: Prisma.StringNullableFilter<"RoadEvent"> | string | null;
    longitude?: Prisma.FloatFilter<"RoadEvent"> | number;
    latitude?: Prisma.FloatFilter<"RoadEvent"> | number;
    createdByInstallationId?: Prisma.StringNullableFilter<"RoadEvent"> | string | null;
    confirmationCount?: Prisma.IntFilter<"RoadEvent"> | number;
    rejectionCount?: Prisma.IntFilter<"RoadEvent"> | number;
    lastConfirmedAt?: Prisma.DateTimeNullableFilter<"RoadEvent"> | Date | string | null;
    confidence?: Prisma.FloatFilter<"RoadEvent"> | number;
    createdAt?: Prisma.DateTimeFilter<"RoadEvent"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"RoadEvent"> | Date | string;
    expiresAt?: Prisma.DateTimeFilter<"RoadEvent"> | Date | string;
    feedbacks?: Prisma.RoadEventFeedbackListRelationFilter;
};
export type RoadEventOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    cityId?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    title?: Prisma.SortOrder;
    description?: Prisma.SortOrderInput | Prisma.SortOrder;
    longitude?: Prisma.SortOrder;
    latitude?: Prisma.SortOrder;
    createdByInstallationId?: Prisma.SortOrderInput | Prisma.SortOrder;
    confirmationCount?: Prisma.SortOrder;
    rejectionCount?: Prisma.SortOrder;
    lastConfirmedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    confidence?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    expiresAt?: Prisma.SortOrder;
    feedbacks?: Prisma.RoadEventFeedbackOrderByRelationAggregateInput;
};
export type RoadEventWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    AND?: Prisma.RoadEventWhereInput | Prisma.RoadEventWhereInput[];
    OR?: Prisma.RoadEventWhereInput[];
    NOT?: Prisma.RoadEventWhereInput | Prisma.RoadEventWhereInput[];
    cityId?: Prisma.StringFilter<"RoadEvent"> | string;
    type?: Prisma.EnumRoadEventTypeFilter<"RoadEvent"> | $Enums.RoadEventType;
    status?: Prisma.EnumRoadEventStatusFilter<"RoadEvent"> | $Enums.RoadEventStatus;
    title?: Prisma.StringFilter<"RoadEvent"> | string;
    description?: Prisma.StringNullableFilter<"RoadEvent"> | string | null;
    longitude?: Prisma.FloatFilter<"RoadEvent"> | number;
    latitude?: Prisma.FloatFilter<"RoadEvent"> | number;
    createdByInstallationId?: Prisma.StringNullableFilter<"RoadEvent"> | string | null;
    confirmationCount?: Prisma.IntFilter<"RoadEvent"> | number;
    rejectionCount?: Prisma.IntFilter<"RoadEvent"> | number;
    lastConfirmedAt?: Prisma.DateTimeNullableFilter<"RoadEvent"> | Date | string | null;
    confidence?: Prisma.FloatFilter<"RoadEvent"> | number;
    createdAt?: Prisma.DateTimeFilter<"RoadEvent"> | Date | string;
    updatedAt?: Prisma.DateTimeFilter<"RoadEvent"> | Date | string;
    expiresAt?: Prisma.DateTimeFilter<"RoadEvent"> | Date | string;
    feedbacks?: Prisma.RoadEventFeedbackListRelationFilter;
}, "id">;
export type RoadEventOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    cityId?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    title?: Prisma.SortOrder;
    description?: Prisma.SortOrderInput | Prisma.SortOrder;
    longitude?: Prisma.SortOrder;
    latitude?: Prisma.SortOrder;
    createdByInstallationId?: Prisma.SortOrderInput | Prisma.SortOrder;
    confirmationCount?: Prisma.SortOrder;
    rejectionCount?: Prisma.SortOrder;
    lastConfirmedAt?: Prisma.SortOrderInput | Prisma.SortOrder;
    confidence?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    expiresAt?: Prisma.SortOrder;
    _count?: Prisma.RoadEventCountOrderByAggregateInput;
    _avg?: Prisma.RoadEventAvgOrderByAggregateInput;
    _max?: Prisma.RoadEventMaxOrderByAggregateInput;
    _min?: Prisma.RoadEventMinOrderByAggregateInput;
    _sum?: Prisma.RoadEventSumOrderByAggregateInput;
};
export type RoadEventScalarWhereWithAggregatesInput = {
    AND?: Prisma.RoadEventScalarWhereWithAggregatesInput | Prisma.RoadEventScalarWhereWithAggregatesInput[];
    OR?: Prisma.RoadEventScalarWhereWithAggregatesInput[];
    NOT?: Prisma.RoadEventScalarWhereWithAggregatesInput | Prisma.RoadEventScalarWhereWithAggregatesInput[];
    id?: Prisma.UuidWithAggregatesFilter<"RoadEvent"> | string;
    cityId?: Prisma.StringWithAggregatesFilter<"RoadEvent"> | string;
    type?: Prisma.EnumRoadEventTypeWithAggregatesFilter<"RoadEvent"> | $Enums.RoadEventType;
    status?: Prisma.EnumRoadEventStatusWithAggregatesFilter<"RoadEvent"> | $Enums.RoadEventStatus;
    title?: Prisma.StringWithAggregatesFilter<"RoadEvent"> | string;
    description?: Prisma.StringNullableWithAggregatesFilter<"RoadEvent"> | string | null;
    longitude?: Prisma.FloatWithAggregatesFilter<"RoadEvent"> | number;
    latitude?: Prisma.FloatWithAggregatesFilter<"RoadEvent"> | number;
    createdByInstallationId?: Prisma.StringNullableWithAggregatesFilter<"RoadEvent"> | string | null;
    confirmationCount?: Prisma.IntWithAggregatesFilter<"RoadEvent"> | number;
    rejectionCount?: Prisma.IntWithAggregatesFilter<"RoadEvent"> | number;
    lastConfirmedAt?: Prisma.DateTimeNullableWithAggregatesFilter<"RoadEvent"> | Date | string | null;
    confidence?: Prisma.FloatWithAggregatesFilter<"RoadEvent"> | number;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"RoadEvent"> | Date | string;
    updatedAt?: Prisma.DateTimeWithAggregatesFilter<"RoadEvent"> | Date | string;
    expiresAt?: Prisma.DateTimeWithAggregatesFilter<"RoadEvent"> | Date | string;
};
export type RoadEventCreateInput = {
    id?: string;
    cityId: string;
    type: $Enums.RoadEventType;
    status?: $Enums.RoadEventStatus;
    title: string;
    description?: string | null;
    longitude: number;
    latitude: number;
    createdByInstallationId?: string | null;
    confirmationCount?: number;
    rejectionCount?: number;
    lastConfirmedAt?: Date | string | null;
    confidence?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    expiresAt: Date | string;
    feedbacks?: Prisma.RoadEventFeedbackCreateNestedManyWithoutRoadEventInput;
};
export type RoadEventUncheckedCreateInput = {
    id?: string;
    cityId: string;
    type: $Enums.RoadEventType;
    status?: $Enums.RoadEventStatus;
    title: string;
    description?: string | null;
    longitude: number;
    latitude: number;
    createdByInstallationId?: string | null;
    confirmationCount?: number;
    rejectionCount?: number;
    lastConfirmedAt?: Date | string | null;
    confidence?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    expiresAt: Date | string;
    feedbacks?: Prisma.RoadEventFeedbackUncheckedCreateNestedManyWithoutRoadEventInput;
};
export type RoadEventUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    cityId?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.EnumRoadEventTypeFieldUpdateOperationsInput | $Enums.RoadEventType;
    status?: Prisma.EnumRoadEventStatusFieldUpdateOperationsInput | $Enums.RoadEventStatus;
    title?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    longitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    latitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdByInstallationId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    confirmationCount?: Prisma.IntFieldUpdateOperationsInput | number;
    rejectionCount?: Prisma.IntFieldUpdateOperationsInput | number;
    lastConfirmedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    confidence?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    expiresAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    feedbacks?: Prisma.RoadEventFeedbackUpdateManyWithoutRoadEventNestedInput;
};
export type RoadEventUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    cityId?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.EnumRoadEventTypeFieldUpdateOperationsInput | $Enums.RoadEventType;
    status?: Prisma.EnumRoadEventStatusFieldUpdateOperationsInput | $Enums.RoadEventStatus;
    title?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    longitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    latitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdByInstallationId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    confirmationCount?: Prisma.IntFieldUpdateOperationsInput | number;
    rejectionCount?: Prisma.IntFieldUpdateOperationsInput | number;
    lastConfirmedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    confidence?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    expiresAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    feedbacks?: Prisma.RoadEventFeedbackUncheckedUpdateManyWithoutRoadEventNestedInput;
};
export type RoadEventCreateManyInput = {
    id?: string;
    cityId: string;
    type: $Enums.RoadEventType;
    status?: $Enums.RoadEventStatus;
    title: string;
    description?: string | null;
    longitude: number;
    latitude: number;
    createdByInstallationId?: string | null;
    confirmationCount?: number;
    rejectionCount?: number;
    lastConfirmedAt?: Date | string | null;
    confidence?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    expiresAt: Date | string;
};
export type RoadEventUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    cityId?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.EnumRoadEventTypeFieldUpdateOperationsInput | $Enums.RoadEventType;
    status?: Prisma.EnumRoadEventStatusFieldUpdateOperationsInput | $Enums.RoadEventStatus;
    title?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    longitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    latitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdByInstallationId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    confirmationCount?: Prisma.IntFieldUpdateOperationsInput | number;
    rejectionCount?: Prisma.IntFieldUpdateOperationsInput | number;
    lastConfirmedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    confidence?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    expiresAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    cityId?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.EnumRoadEventTypeFieldUpdateOperationsInput | $Enums.RoadEventType;
    status?: Prisma.EnumRoadEventStatusFieldUpdateOperationsInput | $Enums.RoadEventStatus;
    title?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    longitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    latitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdByInstallationId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    confirmationCount?: Prisma.IntFieldUpdateOperationsInput | number;
    rejectionCount?: Prisma.IntFieldUpdateOperationsInput | number;
    lastConfirmedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    confidence?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    expiresAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    cityId?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    title?: Prisma.SortOrder;
    description?: Prisma.SortOrder;
    longitude?: Prisma.SortOrder;
    latitude?: Prisma.SortOrder;
    createdByInstallationId?: Prisma.SortOrder;
    confirmationCount?: Prisma.SortOrder;
    rejectionCount?: Prisma.SortOrder;
    lastConfirmedAt?: Prisma.SortOrder;
    confidence?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    expiresAt?: Prisma.SortOrder;
};
export type RoadEventAvgOrderByAggregateInput = {
    longitude?: Prisma.SortOrder;
    latitude?: Prisma.SortOrder;
    confirmationCount?: Prisma.SortOrder;
    rejectionCount?: Prisma.SortOrder;
    confidence?: Prisma.SortOrder;
};
export type RoadEventMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    cityId?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    title?: Prisma.SortOrder;
    description?: Prisma.SortOrder;
    longitude?: Prisma.SortOrder;
    latitude?: Prisma.SortOrder;
    createdByInstallationId?: Prisma.SortOrder;
    confirmationCount?: Prisma.SortOrder;
    rejectionCount?: Prisma.SortOrder;
    lastConfirmedAt?: Prisma.SortOrder;
    confidence?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    expiresAt?: Prisma.SortOrder;
};
export type RoadEventMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    cityId?: Prisma.SortOrder;
    type?: Prisma.SortOrder;
    status?: Prisma.SortOrder;
    title?: Prisma.SortOrder;
    description?: Prisma.SortOrder;
    longitude?: Prisma.SortOrder;
    latitude?: Prisma.SortOrder;
    createdByInstallationId?: Prisma.SortOrder;
    confirmationCount?: Prisma.SortOrder;
    rejectionCount?: Prisma.SortOrder;
    lastConfirmedAt?: Prisma.SortOrder;
    confidence?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    updatedAt?: Prisma.SortOrder;
    expiresAt?: Prisma.SortOrder;
};
export type RoadEventSumOrderByAggregateInput = {
    longitude?: Prisma.SortOrder;
    latitude?: Prisma.SortOrder;
    confirmationCount?: Prisma.SortOrder;
    rejectionCount?: Prisma.SortOrder;
    confidence?: Prisma.SortOrder;
};
export type RoadEventScalarRelationFilter = {
    is?: Prisma.RoadEventWhereInput;
    isNot?: Prisma.RoadEventWhereInput;
};
export type StringFieldUpdateOperationsInput = {
    set?: string;
};
export type EnumRoadEventTypeFieldUpdateOperationsInput = {
    set?: $Enums.RoadEventType;
};
export type EnumRoadEventStatusFieldUpdateOperationsInput = {
    set?: $Enums.RoadEventStatus;
};
export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null;
};
export type FloatFieldUpdateOperationsInput = {
    set?: number;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
};
export type IntFieldUpdateOperationsInput = {
    set?: number;
    increment?: number;
    decrement?: number;
    multiply?: number;
    divide?: number;
};
export type NullableDateTimeFieldUpdateOperationsInput = {
    set?: Date | string | null;
};
export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string;
};
export type RoadEventCreateNestedOneWithoutFeedbacksInput = {
    create?: Prisma.XOR<Prisma.RoadEventCreateWithoutFeedbacksInput, Prisma.RoadEventUncheckedCreateWithoutFeedbacksInput>;
    connectOrCreate?: Prisma.RoadEventCreateOrConnectWithoutFeedbacksInput;
    connect?: Prisma.RoadEventWhereUniqueInput;
};
export type RoadEventUpdateOneRequiredWithoutFeedbacksNestedInput = {
    create?: Prisma.XOR<Prisma.RoadEventCreateWithoutFeedbacksInput, Prisma.RoadEventUncheckedCreateWithoutFeedbacksInput>;
    connectOrCreate?: Prisma.RoadEventCreateOrConnectWithoutFeedbacksInput;
    upsert?: Prisma.RoadEventUpsertWithoutFeedbacksInput;
    connect?: Prisma.RoadEventWhereUniqueInput;
    update?: Prisma.XOR<Prisma.XOR<Prisma.RoadEventUpdateToOneWithWhereWithoutFeedbacksInput, Prisma.RoadEventUpdateWithoutFeedbacksInput>, Prisma.RoadEventUncheckedUpdateWithoutFeedbacksInput>;
};
export type RoadEventCreateWithoutFeedbacksInput = {
    id?: string;
    cityId: string;
    type: $Enums.RoadEventType;
    status?: $Enums.RoadEventStatus;
    title: string;
    description?: string | null;
    longitude: number;
    latitude: number;
    createdByInstallationId?: string | null;
    confirmationCount?: number;
    rejectionCount?: number;
    lastConfirmedAt?: Date | string | null;
    confidence?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    expiresAt: Date | string;
};
export type RoadEventUncheckedCreateWithoutFeedbacksInput = {
    id?: string;
    cityId: string;
    type: $Enums.RoadEventType;
    status?: $Enums.RoadEventStatus;
    title: string;
    description?: string | null;
    longitude: number;
    latitude: number;
    createdByInstallationId?: string | null;
    confirmationCount?: number;
    rejectionCount?: number;
    lastConfirmedAt?: Date | string | null;
    confidence?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
    expiresAt: Date | string;
};
export type RoadEventCreateOrConnectWithoutFeedbacksInput = {
    where: Prisma.RoadEventWhereUniqueInput;
    create: Prisma.XOR<Prisma.RoadEventCreateWithoutFeedbacksInput, Prisma.RoadEventUncheckedCreateWithoutFeedbacksInput>;
};
export type RoadEventUpsertWithoutFeedbacksInput = {
    update: Prisma.XOR<Prisma.RoadEventUpdateWithoutFeedbacksInput, Prisma.RoadEventUncheckedUpdateWithoutFeedbacksInput>;
    create: Prisma.XOR<Prisma.RoadEventCreateWithoutFeedbacksInput, Prisma.RoadEventUncheckedCreateWithoutFeedbacksInput>;
    where?: Prisma.RoadEventWhereInput;
};
export type RoadEventUpdateToOneWithWhereWithoutFeedbacksInput = {
    where?: Prisma.RoadEventWhereInput;
    data: Prisma.XOR<Prisma.RoadEventUpdateWithoutFeedbacksInput, Prisma.RoadEventUncheckedUpdateWithoutFeedbacksInput>;
};
export type RoadEventUpdateWithoutFeedbacksInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    cityId?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.EnumRoadEventTypeFieldUpdateOperationsInput | $Enums.RoadEventType;
    status?: Prisma.EnumRoadEventStatusFieldUpdateOperationsInput | $Enums.RoadEventStatus;
    title?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    longitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    latitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdByInstallationId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    confirmationCount?: Prisma.IntFieldUpdateOperationsInput | number;
    rejectionCount?: Prisma.IntFieldUpdateOperationsInput | number;
    lastConfirmedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    confidence?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    expiresAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventUncheckedUpdateWithoutFeedbacksInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    cityId?: Prisma.StringFieldUpdateOperationsInput | string;
    type?: Prisma.EnumRoadEventTypeFieldUpdateOperationsInput | $Enums.RoadEventType;
    status?: Prisma.EnumRoadEventStatusFieldUpdateOperationsInput | $Enums.RoadEventStatus;
    title?: Prisma.StringFieldUpdateOperationsInput | string;
    description?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    longitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    latitude?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdByInstallationId?: Prisma.NullableStringFieldUpdateOperationsInput | string | null;
    confirmationCount?: Prisma.IntFieldUpdateOperationsInput | number;
    rejectionCount?: Prisma.IntFieldUpdateOperationsInput | number;
    lastConfirmedAt?: Prisma.NullableDateTimeFieldUpdateOperationsInput | Date | string | null;
    confidence?: Prisma.FloatFieldUpdateOperationsInput | number;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    updatedAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    expiresAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventCountOutputType = {
    feedbacks: number;
};
export type RoadEventCountOutputTypeSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    feedbacks?: boolean | RoadEventCountOutputTypeCountFeedbacksArgs;
};
export type RoadEventCountOutputTypeDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventCountOutputTypeSelect<ExtArgs> | null;
};
export type RoadEventCountOutputTypeCountFeedbacksArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.RoadEventFeedbackWhereInput;
};
export type RoadEventSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    cityId?: boolean;
    type?: boolean;
    status?: boolean;
    title?: boolean;
    description?: boolean;
    longitude?: boolean;
    latitude?: boolean;
    createdByInstallationId?: boolean;
    confirmationCount?: boolean;
    rejectionCount?: boolean;
    lastConfirmedAt?: boolean;
    confidence?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    expiresAt?: boolean;
    feedbacks?: boolean | Prisma.RoadEvent$feedbacksArgs<ExtArgs>;
    _count?: boolean | Prisma.RoadEventCountOutputTypeDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["roadEvent"]>;
export type RoadEventSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    cityId?: boolean;
    type?: boolean;
    status?: boolean;
    title?: boolean;
    description?: boolean;
    longitude?: boolean;
    latitude?: boolean;
    createdByInstallationId?: boolean;
    confirmationCount?: boolean;
    rejectionCount?: boolean;
    lastConfirmedAt?: boolean;
    confidence?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    expiresAt?: boolean;
}, ExtArgs["result"]["roadEvent"]>;
export type RoadEventSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    cityId?: boolean;
    type?: boolean;
    status?: boolean;
    title?: boolean;
    description?: boolean;
    longitude?: boolean;
    latitude?: boolean;
    createdByInstallationId?: boolean;
    confirmationCount?: boolean;
    rejectionCount?: boolean;
    lastConfirmedAt?: boolean;
    confidence?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    expiresAt?: boolean;
}, ExtArgs["result"]["roadEvent"]>;
export type RoadEventSelectScalar = {
    id?: boolean;
    cityId?: boolean;
    type?: boolean;
    status?: boolean;
    title?: boolean;
    description?: boolean;
    longitude?: boolean;
    latitude?: boolean;
    createdByInstallationId?: boolean;
    confirmationCount?: boolean;
    rejectionCount?: boolean;
    lastConfirmedAt?: boolean;
    confidence?: boolean;
    createdAt?: boolean;
    updatedAt?: boolean;
    expiresAt?: boolean;
};
export type RoadEventOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "cityId" | "type" | "status" | "title" | "description" | "longitude" | "latitude" | "createdByInstallationId" | "confirmationCount" | "rejectionCount" | "lastConfirmedAt" | "confidence" | "createdAt" | "updatedAt" | "expiresAt", ExtArgs["result"]["roadEvent"]>;
export type RoadEventInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    feedbacks?: boolean | Prisma.RoadEvent$feedbacksArgs<ExtArgs>;
    _count?: boolean | Prisma.RoadEventCountOutputTypeDefaultArgs<ExtArgs>;
};
export type RoadEventIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type RoadEventIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {};
export type $RoadEventPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "RoadEvent";
    objects: {
        feedbacks: Prisma.$RoadEventFeedbackPayload<ExtArgs>[];
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        cityId: string;
        type: $Enums.RoadEventType;
        status: $Enums.RoadEventStatus;
        title: string;
        description: string | null;
        longitude: number;
        latitude: number;
        createdByInstallationId: string | null;
        confirmationCount: number;
        rejectionCount: number;
        lastConfirmedAt: Date | null;
        confidence: number;
        createdAt: Date;
        updatedAt: Date;
        expiresAt: Date;
    }, ExtArgs["result"]["roadEvent"]>;
    composites: {};
};
export type RoadEventGetPayload<S extends boolean | null | undefined | RoadEventDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$RoadEventPayload, S>;
export type RoadEventCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<RoadEventFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: RoadEventCountAggregateInputType | true;
};
export interface RoadEventDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['RoadEvent'];
        meta: {
            name: 'RoadEvent';
        };
    };
    findUnique<T extends RoadEventFindUniqueArgs>(args: Prisma.SelectSubset<T, RoadEventFindUniqueArgs<ExtArgs>>): Prisma.Prisma__RoadEventClient<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findUniqueOrThrow<T extends RoadEventFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, RoadEventFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__RoadEventClient<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findFirst<T extends RoadEventFindFirstArgs>(args?: Prisma.SelectSubset<T, RoadEventFindFirstArgs<ExtArgs>>): Prisma.Prisma__RoadEventClient<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findFirstOrThrow<T extends RoadEventFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, RoadEventFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__RoadEventClient<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findMany<T extends RoadEventFindManyArgs>(args?: Prisma.SelectSubset<T, RoadEventFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    create<T extends RoadEventCreateArgs>(args: Prisma.SelectSubset<T, RoadEventCreateArgs<ExtArgs>>): Prisma.Prisma__RoadEventClient<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    createMany<T extends RoadEventCreateManyArgs>(args?: Prisma.SelectSubset<T, RoadEventCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    createManyAndReturn<T extends RoadEventCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, RoadEventCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    delete<T extends RoadEventDeleteArgs>(args: Prisma.SelectSubset<T, RoadEventDeleteArgs<ExtArgs>>): Prisma.Prisma__RoadEventClient<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    update<T extends RoadEventUpdateArgs>(args: Prisma.SelectSubset<T, RoadEventUpdateArgs<ExtArgs>>): Prisma.Prisma__RoadEventClient<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    deleteMany<T extends RoadEventDeleteManyArgs>(args?: Prisma.SelectSubset<T, RoadEventDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateMany<T extends RoadEventUpdateManyArgs>(args: Prisma.SelectSubset<T, RoadEventUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateManyAndReturn<T extends RoadEventUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, RoadEventUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    upsert<T extends RoadEventUpsertArgs>(args: Prisma.SelectSubset<T, RoadEventUpsertArgs<ExtArgs>>): Prisma.Prisma__RoadEventClient<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    count<T extends RoadEventCountArgs>(args?: Prisma.Subset<T, RoadEventCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], RoadEventCountAggregateOutputType> : number>;
    aggregate<T extends RoadEventAggregateArgs>(args: Prisma.Subset<T, RoadEventAggregateArgs>): Prisma.PrismaPromise<GetRoadEventAggregateType<T>>;
    groupBy<T extends RoadEventGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: RoadEventGroupByArgs['orderBy'];
    } : {
        orderBy?: RoadEventGroupByArgs['orderBy'];
    }, OrderFields extends Prisma.ExcludeUnderscoreKeys<Prisma.Keys<Prisma.MaybeTupleToUnion<T['orderBy']>>>, ByFields extends Prisma.MaybeTupleToUnion<T['by']>, ByValid extends Prisma.Has<ByFields, OrderFields>, HavingFields extends Prisma.GetHavingFields<T['having']>, HavingValid extends Prisma.Has<ByFields, HavingFields>, ByEmpty extends T['by'] extends never[] ? Prisma.True : Prisma.False, InputErrors extends ByEmpty extends Prisma.True ? `Error: "by" must not be empty.` : HavingValid extends Prisma.False ? {
        [P in HavingFields]: P extends ByFields ? never : P extends string ? `Error: Field "${P}" used in "having" needs to be provided in "by".` : [
            Error,
            'Field ',
            P,
            ` in "having" needs to be provided in "by"`
        ];
    }[HavingFields] : 'take' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "take", you also need to provide "orderBy"' : 'skip' extends Prisma.Keys<T> ? 'orderBy' extends Prisma.Keys<T> ? ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields] : 'Error: If you provide "skip", you also need to provide "orderBy"' : ByValid extends Prisma.True ? {} : {
        [P in OrderFields]: P extends ByFields ? never : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`;
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, RoadEventGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRoadEventGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    readonly fields: RoadEventFieldRefs;
}
export interface Prisma__RoadEventClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    feedbacks<T extends Prisma.RoadEvent$feedbacksArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.RoadEvent$feedbacksArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "findMany", GlobalOmitOptions> | Null>;
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
export interface RoadEventFieldRefs {
    readonly id: Prisma.FieldRef<"RoadEvent", 'String'>;
    readonly cityId: Prisma.FieldRef<"RoadEvent", 'String'>;
    readonly type: Prisma.FieldRef<"RoadEvent", 'RoadEventType'>;
    readonly status: Prisma.FieldRef<"RoadEvent", 'RoadEventStatus'>;
    readonly title: Prisma.FieldRef<"RoadEvent", 'String'>;
    readonly description: Prisma.FieldRef<"RoadEvent", 'String'>;
    readonly longitude: Prisma.FieldRef<"RoadEvent", 'Float'>;
    readonly latitude: Prisma.FieldRef<"RoadEvent", 'Float'>;
    readonly createdByInstallationId: Prisma.FieldRef<"RoadEvent", 'String'>;
    readonly confirmationCount: Prisma.FieldRef<"RoadEvent", 'Int'>;
    readonly rejectionCount: Prisma.FieldRef<"RoadEvent", 'Int'>;
    readonly lastConfirmedAt: Prisma.FieldRef<"RoadEvent", 'DateTime'>;
    readonly confidence: Prisma.FieldRef<"RoadEvent", 'Float'>;
    readonly createdAt: Prisma.FieldRef<"RoadEvent", 'DateTime'>;
    readonly updatedAt: Prisma.FieldRef<"RoadEvent", 'DateTime'>;
    readonly expiresAt: Prisma.FieldRef<"RoadEvent", 'DateTime'>;
}
export type RoadEventFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
    where: Prisma.RoadEventWhereUniqueInput;
};
export type RoadEventFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
    where: Prisma.RoadEventWhereUniqueInput;
};
export type RoadEventFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
    where?: Prisma.RoadEventWhereInput;
    orderBy?: Prisma.RoadEventOrderByWithRelationInput | Prisma.RoadEventOrderByWithRelationInput[];
    cursor?: Prisma.RoadEventWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.RoadEventScalarFieldEnum | Prisma.RoadEventScalarFieldEnum[];
};
export type RoadEventFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
    where?: Prisma.RoadEventWhereInput;
    orderBy?: Prisma.RoadEventOrderByWithRelationInput | Prisma.RoadEventOrderByWithRelationInput[];
    cursor?: Prisma.RoadEventWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.RoadEventScalarFieldEnum | Prisma.RoadEventScalarFieldEnum[];
};
export type RoadEventFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
    where?: Prisma.RoadEventWhereInput;
    orderBy?: Prisma.RoadEventOrderByWithRelationInput | Prisma.RoadEventOrderByWithRelationInput[];
    cursor?: Prisma.RoadEventWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.RoadEventScalarFieldEnum | Prisma.RoadEventScalarFieldEnum[];
};
export type RoadEventCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.RoadEventCreateInput, Prisma.RoadEventUncheckedCreateInput>;
};
export type RoadEventCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.RoadEventCreateManyInput | Prisma.RoadEventCreateManyInput[];
    skipDuplicates?: boolean;
};
export type RoadEventCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelectCreateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    data: Prisma.RoadEventCreateManyInput | Prisma.RoadEventCreateManyInput[];
    skipDuplicates?: boolean;
};
export type RoadEventUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.RoadEventUpdateInput, Prisma.RoadEventUncheckedUpdateInput>;
    where: Prisma.RoadEventWhereUniqueInput;
};
export type RoadEventUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.XOR<Prisma.RoadEventUpdateManyMutationInput, Prisma.RoadEventUncheckedUpdateManyInput>;
    where?: Prisma.RoadEventWhereInput;
    limit?: number;
};
export type RoadEventUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelectUpdateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.RoadEventUpdateManyMutationInput, Prisma.RoadEventUncheckedUpdateManyInput>;
    where?: Prisma.RoadEventWhereInput;
    limit?: number;
};
export type RoadEventUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
    where: Prisma.RoadEventWhereUniqueInput;
    create: Prisma.XOR<Prisma.RoadEventCreateInput, Prisma.RoadEventUncheckedCreateInput>;
    update: Prisma.XOR<Prisma.RoadEventUpdateInput, Prisma.RoadEventUncheckedUpdateInput>;
};
export type RoadEventDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
    where: Prisma.RoadEventWhereUniqueInput;
};
export type RoadEventDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.RoadEventWhereInput;
    limit?: number;
};
export type RoadEvent$feedbacksArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    include?: Prisma.RoadEventFeedbackInclude<ExtArgs> | null;
    where?: Prisma.RoadEventFeedbackWhereInput;
    orderBy?: Prisma.RoadEventFeedbackOrderByWithRelationInput | Prisma.RoadEventFeedbackOrderByWithRelationInput[];
    cursor?: Prisma.RoadEventFeedbackWhereUniqueInput;
    take?: number;
    skip?: number;
    distinct?: Prisma.RoadEventFeedbackScalarFieldEnum | Prisma.RoadEventFeedbackScalarFieldEnum[];
};
export type RoadEventDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventOmit<ExtArgs> | null;
    include?: Prisma.RoadEventInclude<ExtArgs> | null;
};
