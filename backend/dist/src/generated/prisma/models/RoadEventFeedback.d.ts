import type * as runtime from "@prisma/client/runtime/client";
import type * as $Enums from "../enums.js";
import type * as Prisma from "../internal/prismaNamespace.js";
export type RoadEventFeedbackModel = runtime.Types.Result.DefaultSelection<Prisma.$RoadEventFeedbackPayload>;
export type AggregateRoadEventFeedback = {
    _count: RoadEventFeedbackCountAggregateOutputType | null;
    _min: RoadEventFeedbackMinAggregateOutputType | null;
    _max: RoadEventFeedbackMaxAggregateOutputType | null;
};
export type RoadEventFeedbackMinAggregateOutputType = {
    id: string | null;
    roadEventId: string | null;
    installationId: string | null;
    action: $Enums.RoadEventFeedbackAction | null;
    createdAt: Date | null;
};
export type RoadEventFeedbackMaxAggregateOutputType = {
    id: string | null;
    roadEventId: string | null;
    installationId: string | null;
    action: $Enums.RoadEventFeedbackAction | null;
    createdAt: Date | null;
};
export type RoadEventFeedbackCountAggregateOutputType = {
    id: number;
    roadEventId: number;
    installationId: number;
    action: number;
    createdAt: number;
    _all: number;
};
export type RoadEventFeedbackMinAggregateInputType = {
    id?: true;
    roadEventId?: true;
    installationId?: true;
    action?: true;
    createdAt?: true;
};
export type RoadEventFeedbackMaxAggregateInputType = {
    id?: true;
    roadEventId?: true;
    installationId?: true;
    action?: true;
    createdAt?: true;
};
export type RoadEventFeedbackCountAggregateInputType = {
    id?: true;
    roadEventId?: true;
    installationId?: true;
    action?: true;
    createdAt?: true;
    _all?: true;
};
export type RoadEventFeedbackAggregateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.RoadEventFeedbackWhereInput;
    orderBy?: Prisma.RoadEventFeedbackOrderByWithRelationInput | Prisma.RoadEventFeedbackOrderByWithRelationInput[];
    cursor?: Prisma.RoadEventFeedbackWhereUniqueInput;
    take?: number;
    skip?: number;
    _count?: true | RoadEventFeedbackCountAggregateInputType;
    _min?: RoadEventFeedbackMinAggregateInputType;
    _max?: RoadEventFeedbackMaxAggregateInputType;
};
export type GetRoadEventFeedbackAggregateType<T extends RoadEventFeedbackAggregateArgs> = {
    [P in keyof T & keyof AggregateRoadEventFeedback]: P extends '_count' | 'count' ? T[P] extends true ? number : Prisma.GetScalarType<T[P], AggregateRoadEventFeedback[P]> : Prisma.GetScalarType<T[P], AggregateRoadEventFeedback[P]>;
};
export type RoadEventFeedbackGroupByArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.RoadEventFeedbackWhereInput;
    orderBy?: Prisma.RoadEventFeedbackOrderByWithAggregationInput | Prisma.RoadEventFeedbackOrderByWithAggregationInput[];
    by: Prisma.RoadEventFeedbackScalarFieldEnum[] | Prisma.RoadEventFeedbackScalarFieldEnum;
    having?: Prisma.RoadEventFeedbackScalarWhereWithAggregatesInput;
    take?: number;
    skip?: number;
    _count?: RoadEventFeedbackCountAggregateInputType | true;
    _min?: RoadEventFeedbackMinAggregateInputType;
    _max?: RoadEventFeedbackMaxAggregateInputType;
};
export type RoadEventFeedbackGroupByOutputType = {
    id: string;
    roadEventId: string;
    installationId: string;
    action: $Enums.RoadEventFeedbackAction;
    createdAt: Date;
    _count: RoadEventFeedbackCountAggregateOutputType | null;
    _min: RoadEventFeedbackMinAggregateOutputType | null;
    _max: RoadEventFeedbackMaxAggregateOutputType | null;
};
export type GetRoadEventFeedbackGroupByPayload<T extends RoadEventFeedbackGroupByArgs> = Prisma.PrismaPromise<Array<Prisma.PickEnumerable<RoadEventFeedbackGroupByOutputType, T['by']> & {
    [P in ((keyof T) & (keyof RoadEventFeedbackGroupByOutputType))]: P extends '_count' ? T[P] extends boolean ? number : Prisma.GetScalarType<T[P], RoadEventFeedbackGroupByOutputType[P]> : Prisma.GetScalarType<T[P], RoadEventFeedbackGroupByOutputType[P]>;
}>>;
export type RoadEventFeedbackWhereInput = {
    AND?: Prisma.RoadEventFeedbackWhereInput | Prisma.RoadEventFeedbackWhereInput[];
    OR?: Prisma.RoadEventFeedbackWhereInput[];
    NOT?: Prisma.RoadEventFeedbackWhereInput | Prisma.RoadEventFeedbackWhereInput[];
    id?: Prisma.UuidFilter<"RoadEventFeedback"> | string;
    roadEventId?: Prisma.UuidFilter<"RoadEventFeedback"> | string;
    installationId?: Prisma.StringFilter<"RoadEventFeedback"> | string;
    action?: Prisma.EnumRoadEventFeedbackActionFilter<"RoadEventFeedback"> | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFilter<"RoadEventFeedback"> | Date | string;
    roadEvent?: Prisma.XOR<Prisma.RoadEventScalarRelationFilter, Prisma.RoadEventWhereInput>;
};
export type RoadEventFeedbackOrderByWithRelationInput = {
    id?: Prisma.SortOrder;
    roadEventId?: Prisma.SortOrder;
    installationId?: Prisma.SortOrder;
    action?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    roadEvent?: Prisma.RoadEventOrderByWithRelationInput;
};
export type RoadEventFeedbackWhereUniqueInput = Prisma.AtLeast<{
    id?: string;
    roadEventId_installationId?: Prisma.RoadEventFeedbackRoadEventIdInstallationIdCompoundUniqueInput;
    AND?: Prisma.RoadEventFeedbackWhereInput | Prisma.RoadEventFeedbackWhereInput[];
    OR?: Prisma.RoadEventFeedbackWhereInput[];
    NOT?: Prisma.RoadEventFeedbackWhereInput | Prisma.RoadEventFeedbackWhereInput[];
    roadEventId?: Prisma.UuidFilter<"RoadEventFeedback"> | string;
    installationId?: Prisma.StringFilter<"RoadEventFeedback"> | string;
    action?: Prisma.EnumRoadEventFeedbackActionFilter<"RoadEventFeedback"> | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFilter<"RoadEventFeedback"> | Date | string;
    roadEvent?: Prisma.XOR<Prisma.RoadEventScalarRelationFilter, Prisma.RoadEventWhereInput>;
}, "id" | "roadEventId_installationId">;
export type RoadEventFeedbackOrderByWithAggregationInput = {
    id?: Prisma.SortOrder;
    roadEventId?: Prisma.SortOrder;
    installationId?: Prisma.SortOrder;
    action?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
    _count?: Prisma.RoadEventFeedbackCountOrderByAggregateInput;
    _max?: Prisma.RoadEventFeedbackMaxOrderByAggregateInput;
    _min?: Prisma.RoadEventFeedbackMinOrderByAggregateInput;
};
export type RoadEventFeedbackScalarWhereWithAggregatesInput = {
    AND?: Prisma.RoadEventFeedbackScalarWhereWithAggregatesInput | Prisma.RoadEventFeedbackScalarWhereWithAggregatesInput[];
    OR?: Prisma.RoadEventFeedbackScalarWhereWithAggregatesInput[];
    NOT?: Prisma.RoadEventFeedbackScalarWhereWithAggregatesInput | Prisma.RoadEventFeedbackScalarWhereWithAggregatesInput[];
    id?: Prisma.UuidWithAggregatesFilter<"RoadEventFeedback"> | string;
    roadEventId?: Prisma.UuidWithAggregatesFilter<"RoadEventFeedback"> | string;
    installationId?: Prisma.StringWithAggregatesFilter<"RoadEventFeedback"> | string;
    action?: Prisma.EnumRoadEventFeedbackActionWithAggregatesFilter<"RoadEventFeedback"> | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeWithAggregatesFilter<"RoadEventFeedback"> | Date | string;
};
export type RoadEventFeedbackCreateInput = {
    id?: string;
    installationId: string;
    action: $Enums.RoadEventFeedbackAction;
    createdAt?: Date | string;
    roadEvent: Prisma.RoadEventCreateNestedOneWithoutFeedbacksInput;
};
export type RoadEventFeedbackUncheckedCreateInput = {
    id?: string;
    roadEventId: string;
    installationId: string;
    action: $Enums.RoadEventFeedbackAction;
    createdAt?: Date | string;
};
export type RoadEventFeedbackUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    installationId?: Prisma.StringFieldUpdateOperationsInput | string;
    action?: Prisma.EnumRoadEventFeedbackActionFieldUpdateOperationsInput | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
    roadEvent?: Prisma.RoadEventUpdateOneRequiredWithoutFeedbacksNestedInput;
};
export type RoadEventFeedbackUncheckedUpdateInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    roadEventId?: Prisma.StringFieldUpdateOperationsInput | string;
    installationId?: Prisma.StringFieldUpdateOperationsInput | string;
    action?: Prisma.EnumRoadEventFeedbackActionFieldUpdateOperationsInput | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventFeedbackCreateManyInput = {
    id?: string;
    roadEventId: string;
    installationId: string;
    action: $Enums.RoadEventFeedbackAction;
    createdAt?: Date | string;
};
export type RoadEventFeedbackUpdateManyMutationInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    installationId?: Prisma.StringFieldUpdateOperationsInput | string;
    action?: Prisma.EnumRoadEventFeedbackActionFieldUpdateOperationsInput | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventFeedbackUncheckedUpdateManyInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    roadEventId?: Prisma.StringFieldUpdateOperationsInput | string;
    installationId?: Prisma.StringFieldUpdateOperationsInput | string;
    action?: Prisma.EnumRoadEventFeedbackActionFieldUpdateOperationsInput | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventFeedbackListRelationFilter = {
    every?: Prisma.RoadEventFeedbackWhereInput;
    some?: Prisma.RoadEventFeedbackWhereInput;
    none?: Prisma.RoadEventFeedbackWhereInput;
};
export type RoadEventFeedbackOrderByRelationAggregateInput = {
    _count?: Prisma.SortOrder;
};
export type RoadEventFeedbackRoadEventIdInstallationIdCompoundUniqueInput = {
    roadEventId: string;
    installationId: string;
};
export type RoadEventFeedbackCountOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    roadEventId?: Prisma.SortOrder;
    installationId?: Prisma.SortOrder;
    action?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type RoadEventFeedbackMaxOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    roadEventId?: Prisma.SortOrder;
    installationId?: Prisma.SortOrder;
    action?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type RoadEventFeedbackMinOrderByAggregateInput = {
    id?: Prisma.SortOrder;
    roadEventId?: Prisma.SortOrder;
    installationId?: Prisma.SortOrder;
    action?: Prisma.SortOrder;
    createdAt?: Prisma.SortOrder;
};
export type RoadEventFeedbackCreateNestedManyWithoutRoadEventInput = {
    create?: Prisma.XOR<Prisma.RoadEventFeedbackCreateWithoutRoadEventInput, Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput> | Prisma.RoadEventFeedbackCreateWithoutRoadEventInput[] | Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput[];
    connectOrCreate?: Prisma.RoadEventFeedbackCreateOrConnectWithoutRoadEventInput | Prisma.RoadEventFeedbackCreateOrConnectWithoutRoadEventInput[];
    createMany?: Prisma.RoadEventFeedbackCreateManyRoadEventInputEnvelope;
    connect?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
};
export type RoadEventFeedbackUncheckedCreateNestedManyWithoutRoadEventInput = {
    create?: Prisma.XOR<Prisma.RoadEventFeedbackCreateWithoutRoadEventInput, Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput> | Prisma.RoadEventFeedbackCreateWithoutRoadEventInput[] | Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput[];
    connectOrCreate?: Prisma.RoadEventFeedbackCreateOrConnectWithoutRoadEventInput | Prisma.RoadEventFeedbackCreateOrConnectWithoutRoadEventInput[];
    createMany?: Prisma.RoadEventFeedbackCreateManyRoadEventInputEnvelope;
    connect?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
};
export type RoadEventFeedbackUpdateManyWithoutRoadEventNestedInput = {
    create?: Prisma.XOR<Prisma.RoadEventFeedbackCreateWithoutRoadEventInput, Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput> | Prisma.RoadEventFeedbackCreateWithoutRoadEventInput[] | Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput[];
    connectOrCreate?: Prisma.RoadEventFeedbackCreateOrConnectWithoutRoadEventInput | Prisma.RoadEventFeedbackCreateOrConnectWithoutRoadEventInput[];
    upsert?: Prisma.RoadEventFeedbackUpsertWithWhereUniqueWithoutRoadEventInput | Prisma.RoadEventFeedbackUpsertWithWhereUniqueWithoutRoadEventInput[];
    createMany?: Prisma.RoadEventFeedbackCreateManyRoadEventInputEnvelope;
    set?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
    disconnect?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
    delete?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
    connect?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
    update?: Prisma.RoadEventFeedbackUpdateWithWhereUniqueWithoutRoadEventInput | Prisma.RoadEventFeedbackUpdateWithWhereUniqueWithoutRoadEventInput[];
    updateMany?: Prisma.RoadEventFeedbackUpdateManyWithWhereWithoutRoadEventInput | Prisma.RoadEventFeedbackUpdateManyWithWhereWithoutRoadEventInput[];
    deleteMany?: Prisma.RoadEventFeedbackScalarWhereInput | Prisma.RoadEventFeedbackScalarWhereInput[];
};
export type RoadEventFeedbackUncheckedUpdateManyWithoutRoadEventNestedInput = {
    create?: Prisma.XOR<Prisma.RoadEventFeedbackCreateWithoutRoadEventInput, Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput> | Prisma.RoadEventFeedbackCreateWithoutRoadEventInput[] | Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput[];
    connectOrCreate?: Prisma.RoadEventFeedbackCreateOrConnectWithoutRoadEventInput | Prisma.RoadEventFeedbackCreateOrConnectWithoutRoadEventInput[];
    upsert?: Prisma.RoadEventFeedbackUpsertWithWhereUniqueWithoutRoadEventInput | Prisma.RoadEventFeedbackUpsertWithWhereUniqueWithoutRoadEventInput[];
    createMany?: Prisma.RoadEventFeedbackCreateManyRoadEventInputEnvelope;
    set?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
    disconnect?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
    delete?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
    connect?: Prisma.RoadEventFeedbackWhereUniqueInput | Prisma.RoadEventFeedbackWhereUniqueInput[];
    update?: Prisma.RoadEventFeedbackUpdateWithWhereUniqueWithoutRoadEventInput | Prisma.RoadEventFeedbackUpdateWithWhereUniqueWithoutRoadEventInput[];
    updateMany?: Prisma.RoadEventFeedbackUpdateManyWithWhereWithoutRoadEventInput | Prisma.RoadEventFeedbackUpdateManyWithWhereWithoutRoadEventInput[];
    deleteMany?: Prisma.RoadEventFeedbackScalarWhereInput | Prisma.RoadEventFeedbackScalarWhereInput[];
};
export type EnumRoadEventFeedbackActionFieldUpdateOperationsInput = {
    set?: $Enums.RoadEventFeedbackAction;
};
export type RoadEventFeedbackCreateWithoutRoadEventInput = {
    id?: string;
    installationId: string;
    action: $Enums.RoadEventFeedbackAction;
    createdAt?: Date | string;
};
export type RoadEventFeedbackUncheckedCreateWithoutRoadEventInput = {
    id?: string;
    installationId: string;
    action: $Enums.RoadEventFeedbackAction;
    createdAt?: Date | string;
};
export type RoadEventFeedbackCreateOrConnectWithoutRoadEventInput = {
    where: Prisma.RoadEventFeedbackWhereUniqueInput;
    create: Prisma.XOR<Prisma.RoadEventFeedbackCreateWithoutRoadEventInput, Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput>;
};
export type RoadEventFeedbackCreateManyRoadEventInputEnvelope = {
    data: Prisma.RoadEventFeedbackCreateManyRoadEventInput | Prisma.RoadEventFeedbackCreateManyRoadEventInput[];
    skipDuplicates?: boolean;
};
export type RoadEventFeedbackUpsertWithWhereUniqueWithoutRoadEventInput = {
    where: Prisma.RoadEventFeedbackWhereUniqueInput;
    update: Prisma.XOR<Prisma.RoadEventFeedbackUpdateWithoutRoadEventInput, Prisma.RoadEventFeedbackUncheckedUpdateWithoutRoadEventInput>;
    create: Prisma.XOR<Prisma.RoadEventFeedbackCreateWithoutRoadEventInput, Prisma.RoadEventFeedbackUncheckedCreateWithoutRoadEventInput>;
};
export type RoadEventFeedbackUpdateWithWhereUniqueWithoutRoadEventInput = {
    where: Prisma.RoadEventFeedbackWhereUniqueInput;
    data: Prisma.XOR<Prisma.RoadEventFeedbackUpdateWithoutRoadEventInput, Prisma.RoadEventFeedbackUncheckedUpdateWithoutRoadEventInput>;
};
export type RoadEventFeedbackUpdateManyWithWhereWithoutRoadEventInput = {
    where: Prisma.RoadEventFeedbackScalarWhereInput;
    data: Prisma.XOR<Prisma.RoadEventFeedbackUpdateManyMutationInput, Prisma.RoadEventFeedbackUncheckedUpdateManyWithoutRoadEventInput>;
};
export type RoadEventFeedbackScalarWhereInput = {
    AND?: Prisma.RoadEventFeedbackScalarWhereInput | Prisma.RoadEventFeedbackScalarWhereInput[];
    OR?: Prisma.RoadEventFeedbackScalarWhereInput[];
    NOT?: Prisma.RoadEventFeedbackScalarWhereInput | Prisma.RoadEventFeedbackScalarWhereInput[];
    id?: Prisma.UuidFilter<"RoadEventFeedback"> | string;
    roadEventId?: Prisma.UuidFilter<"RoadEventFeedback"> | string;
    installationId?: Prisma.StringFilter<"RoadEventFeedback"> | string;
    action?: Prisma.EnumRoadEventFeedbackActionFilter<"RoadEventFeedback"> | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFilter<"RoadEventFeedback"> | Date | string;
};
export type RoadEventFeedbackCreateManyRoadEventInput = {
    id?: string;
    installationId: string;
    action: $Enums.RoadEventFeedbackAction;
    createdAt?: Date | string;
};
export type RoadEventFeedbackUpdateWithoutRoadEventInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    installationId?: Prisma.StringFieldUpdateOperationsInput | string;
    action?: Prisma.EnumRoadEventFeedbackActionFieldUpdateOperationsInput | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventFeedbackUncheckedUpdateWithoutRoadEventInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    installationId?: Prisma.StringFieldUpdateOperationsInput | string;
    action?: Prisma.EnumRoadEventFeedbackActionFieldUpdateOperationsInput | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventFeedbackUncheckedUpdateManyWithoutRoadEventInput = {
    id?: Prisma.StringFieldUpdateOperationsInput | string;
    installationId?: Prisma.StringFieldUpdateOperationsInput | string;
    action?: Prisma.EnumRoadEventFeedbackActionFieldUpdateOperationsInput | $Enums.RoadEventFeedbackAction;
    createdAt?: Prisma.DateTimeFieldUpdateOperationsInput | Date | string;
};
export type RoadEventFeedbackSelect<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    roadEventId?: boolean;
    installationId?: boolean;
    action?: boolean;
    createdAt?: boolean;
    roadEvent?: boolean | Prisma.RoadEventDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["roadEventFeedback"]>;
export type RoadEventFeedbackSelectCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    roadEventId?: boolean;
    installationId?: boolean;
    action?: boolean;
    createdAt?: boolean;
    roadEvent?: boolean | Prisma.RoadEventDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["roadEventFeedback"]>;
export type RoadEventFeedbackSelectUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetSelect<{
    id?: boolean;
    roadEventId?: boolean;
    installationId?: boolean;
    action?: boolean;
    createdAt?: boolean;
    roadEvent?: boolean | Prisma.RoadEventDefaultArgs<ExtArgs>;
}, ExtArgs["result"]["roadEventFeedback"]>;
export type RoadEventFeedbackSelectScalar = {
    id?: boolean;
    roadEventId?: boolean;
    installationId?: boolean;
    action?: boolean;
    createdAt?: boolean;
};
export type RoadEventFeedbackOmit<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = runtime.Types.Extensions.GetOmit<"id" | "roadEventId" | "installationId" | "action" | "createdAt", ExtArgs["result"]["roadEventFeedback"]>;
export type RoadEventFeedbackInclude<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    roadEvent?: boolean | Prisma.RoadEventDefaultArgs<ExtArgs>;
};
export type RoadEventFeedbackIncludeCreateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    roadEvent?: boolean | Prisma.RoadEventDefaultArgs<ExtArgs>;
};
export type RoadEventFeedbackIncludeUpdateManyAndReturn<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    roadEvent?: boolean | Prisma.RoadEventDefaultArgs<ExtArgs>;
};
export type $RoadEventFeedbackPayload<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    name: "RoadEventFeedback";
    objects: {
        roadEvent: Prisma.$RoadEventPayload<ExtArgs>;
    };
    scalars: runtime.Types.Extensions.GetPayloadResult<{
        id: string;
        roadEventId: string;
        installationId: string;
        action: $Enums.RoadEventFeedbackAction;
        createdAt: Date;
    }, ExtArgs["result"]["roadEventFeedback"]>;
    composites: {};
};
export type RoadEventFeedbackGetPayload<S extends boolean | null | undefined | RoadEventFeedbackDefaultArgs> = runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload, S>;
export type RoadEventFeedbackCountArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = Omit<RoadEventFeedbackFindManyArgs, 'select' | 'include' | 'distinct' | 'omit'> & {
    select?: RoadEventFeedbackCountAggregateInputType | true;
};
export interface RoadEventFeedbackDelegate<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> {
    [K: symbol]: {
        types: Prisma.TypeMap<ExtArgs>['model']['RoadEventFeedback'];
        meta: {
            name: 'RoadEventFeedback';
        };
    };
    findUnique<T extends RoadEventFeedbackFindUniqueArgs>(args: Prisma.SelectSubset<T, RoadEventFeedbackFindUniqueArgs<ExtArgs>>): Prisma.Prisma__RoadEventFeedbackClient<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "findUnique", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findUniqueOrThrow<T extends RoadEventFeedbackFindUniqueOrThrowArgs>(args: Prisma.SelectSubset<T, RoadEventFeedbackFindUniqueOrThrowArgs<ExtArgs>>): Prisma.Prisma__RoadEventFeedbackClient<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findFirst<T extends RoadEventFeedbackFindFirstArgs>(args?: Prisma.SelectSubset<T, RoadEventFeedbackFindFirstArgs<ExtArgs>>): Prisma.Prisma__RoadEventFeedbackClient<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "findFirst", GlobalOmitOptions> | null, null, ExtArgs, GlobalOmitOptions>;
    findFirstOrThrow<T extends RoadEventFeedbackFindFirstOrThrowArgs>(args?: Prisma.SelectSubset<T, RoadEventFeedbackFindFirstOrThrowArgs<ExtArgs>>): Prisma.Prisma__RoadEventFeedbackClient<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "findFirstOrThrow", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    findMany<T extends RoadEventFeedbackFindManyArgs>(args?: Prisma.SelectSubset<T, RoadEventFeedbackFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "findMany", GlobalOmitOptions>>;
    create<T extends RoadEventFeedbackCreateArgs>(args: Prisma.SelectSubset<T, RoadEventFeedbackCreateArgs<ExtArgs>>): Prisma.Prisma__RoadEventFeedbackClient<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "create", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    createMany<T extends RoadEventFeedbackCreateManyArgs>(args?: Prisma.SelectSubset<T, RoadEventFeedbackCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    createManyAndReturn<T extends RoadEventFeedbackCreateManyAndReturnArgs>(args?: Prisma.SelectSubset<T, RoadEventFeedbackCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "createManyAndReturn", GlobalOmitOptions>>;
    delete<T extends RoadEventFeedbackDeleteArgs>(args: Prisma.SelectSubset<T, RoadEventFeedbackDeleteArgs<ExtArgs>>): Prisma.Prisma__RoadEventFeedbackClient<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "delete", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    update<T extends RoadEventFeedbackUpdateArgs>(args: Prisma.SelectSubset<T, RoadEventFeedbackUpdateArgs<ExtArgs>>): Prisma.Prisma__RoadEventFeedbackClient<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "update", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    deleteMany<T extends RoadEventFeedbackDeleteManyArgs>(args?: Prisma.SelectSubset<T, RoadEventFeedbackDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateMany<T extends RoadEventFeedbackUpdateManyArgs>(args: Prisma.SelectSubset<T, RoadEventFeedbackUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<Prisma.BatchPayload>;
    updateManyAndReturn<T extends RoadEventFeedbackUpdateManyAndReturnArgs>(args: Prisma.SelectSubset<T, RoadEventFeedbackUpdateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "updateManyAndReturn", GlobalOmitOptions>>;
    upsert<T extends RoadEventFeedbackUpsertArgs>(args: Prisma.SelectSubset<T, RoadEventFeedbackUpsertArgs<ExtArgs>>): Prisma.Prisma__RoadEventFeedbackClient<runtime.Types.Result.GetResult<Prisma.$RoadEventFeedbackPayload<ExtArgs>, T, "upsert", GlobalOmitOptions>, never, ExtArgs, GlobalOmitOptions>;
    count<T extends RoadEventFeedbackCountArgs>(args?: Prisma.Subset<T, RoadEventFeedbackCountArgs>): Prisma.PrismaPromise<T extends runtime.Types.Utils.Record<'select', any> ? T['select'] extends true ? number : Prisma.GetScalarType<T['select'], RoadEventFeedbackCountAggregateOutputType> : number>;
    aggregate<T extends RoadEventFeedbackAggregateArgs>(args: Prisma.Subset<T, RoadEventFeedbackAggregateArgs>): Prisma.PrismaPromise<GetRoadEventFeedbackAggregateType<T>>;
    groupBy<T extends RoadEventFeedbackGroupByArgs, HasSelectOrTake extends Prisma.Or<Prisma.Extends<'skip', Prisma.Keys<T>>, Prisma.Extends<'take', Prisma.Keys<T>>>, OrderByArg extends Prisma.True extends HasSelectOrTake ? {
        orderBy: RoadEventFeedbackGroupByArgs['orderBy'];
    } : {
        orderBy?: RoadEventFeedbackGroupByArgs['orderBy'];
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
    }[OrderFields]>(args: Prisma.SubsetIntersection<T, RoadEventFeedbackGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetRoadEventFeedbackGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>;
    readonly fields: RoadEventFeedbackFieldRefs;
}
export interface Prisma__RoadEventFeedbackClient<T, Null = never, ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs, GlobalOmitOptions = {}> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise";
    roadEvent<T extends Prisma.RoadEventDefaultArgs<ExtArgs> = {}>(args?: Prisma.Subset<T, Prisma.RoadEventDefaultArgs<ExtArgs>>): Prisma.Prisma__RoadEventClient<runtime.Types.Result.GetResult<Prisma.$RoadEventPayload<ExtArgs>, T, "findUniqueOrThrow", GlobalOmitOptions> | Null, Null, ExtArgs, GlobalOmitOptions>;
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): runtime.Types.Utils.JsPromise<T | TResult>;
    finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}
export interface RoadEventFeedbackFieldRefs {
    readonly id: Prisma.FieldRef<"RoadEventFeedback", 'String'>;
    readonly roadEventId: Prisma.FieldRef<"RoadEventFeedback", 'String'>;
    readonly installationId: Prisma.FieldRef<"RoadEventFeedback", 'String'>;
    readonly action: Prisma.FieldRef<"RoadEventFeedback", 'RoadEventFeedbackAction'>;
    readonly createdAt: Prisma.FieldRef<"RoadEventFeedback", 'DateTime'>;
}
export type RoadEventFeedbackFindUniqueArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    include?: Prisma.RoadEventFeedbackInclude<ExtArgs> | null;
    where: Prisma.RoadEventFeedbackWhereUniqueInput;
};
export type RoadEventFeedbackFindUniqueOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    include?: Prisma.RoadEventFeedbackInclude<ExtArgs> | null;
    where: Prisma.RoadEventFeedbackWhereUniqueInput;
};
export type RoadEventFeedbackFindFirstArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
export type RoadEventFeedbackFindFirstOrThrowArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
export type RoadEventFeedbackFindManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
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
export type RoadEventFeedbackCreateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    include?: Prisma.RoadEventFeedbackInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.RoadEventFeedbackCreateInput, Prisma.RoadEventFeedbackUncheckedCreateInput>;
};
export type RoadEventFeedbackCreateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.RoadEventFeedbackCreateManyInput | Prisma.RoadEventFeedbackCreateManyInput[];
    skipDuplicates?: boolean;
};
export type RoadEventFeedbackCreateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelectCreateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    data: Prisma.RoadEventFeedbackCreateManyInput | Prisma.RoadEventFeedbackCreateManyInput[];
    skipDuplicates?: boolean;
    include?: Prisma.RoadEventFeedbackIncludeCreateManyAndReturn<ExtArgs> | null;
};
export type RoadEventFeedbackUpdateArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    include?: Prisma.RoadEventFeedbackInclude<ExtArgs> | null;
    data: Prisma.XOR<Prisma.RoadEventFeedbackUpdateInput, Prisma.RoadEventFeedbackUncheckedUpdateInput>;
    where: Prisma.RoadEventFeedbackWhereUniqueInput;
};
export type RoadEventFeedbackUpdateManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    data: Prisma.XOR<Prisma.RoadEventFeedbackUpdateManyMutationInput, Prisma.RoadEventFeedbackUncheckedUpdateManyInput>;
    where?: Prisma.RoadEventFeedbackWhereInput;
    limit?: number;
};
export type RoadEventFeedbackUpdateManyAndReturnArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelectUpdateManyAndReturn<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    data: Prisma.XOR<Prisma.RoadEventFeedbackUpdateManyMutationInput, Prisma.RoadEventFeedbackUncheckedUpdateManyInput>;
    where?: Prisma.RoadEventFeedbackWhereInput;
    limit?: number;
    include?: Prisma.RoadEventFeedbackIncludeUpdateManyAndReturn<ExtArgs> | null;
};
export type RoadEventFeedbackUpsertArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    include?: Prisma.RoadEventFeedbackInclude<ExtArgs> | null;
    where: Prisma.RoadEventFeedbackWhereUniqueInput;
    create: Prisma.XOR<Prisma.RoadEventFeedbackCreateInput, Prisma.RoadEventFeedbackUncheckedCreateInput>;
    update: Prisma.XOR<Prisma.RoadEventFeedbackUpdateInput, Prisma.RoadEventFeedbackUncheckedUpdateInput>;
};
export type RoadEventFeedbackDeleteArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    include?: Prisma.RoadEventFeedbackInclude<ExtArgs> | null;
    where: Prisma.RoadEventFeedbackWhereUniqueInput;
};
export type RoadEventFeedbackDeleteManyArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    where?: Prisma.RoadEventFeedbackWhereInput;
    limit?: number;
};
export type RoadEventFeedbackDefaultArgs<ExtArgs extends runtime.Types.Extensions.InternalArgs = runtime.Types.Extensions.DefaultArgs> = {
    select?: Prisma.RoadEventFeedbackSelect<ExtArgs> | null;
    omit?: Prisma.RoadEventFeedbackOmit<ExtArgs> | null;
    include?: Prisma.RoadEventFeedbackInclude<ExtArgs> | null;
};
