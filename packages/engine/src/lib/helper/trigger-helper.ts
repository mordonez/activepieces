import { pieces } from "@activepieces/pieces-apps";
import { ApEdition, EventPayload, ExecuteEventParserOperation, ExecuteTriggerOperation, ExecuteTriggerResponse, ExecutionState, ParseEventResponse, PieceTrigger, TriggerHookType } from "@activepieces/shared";
import { TriggerStrategy } from "@activepieces/framework";
import { createContextStore } from "../services/storage.service";
import { VariableService } from "../services/variable-service";

export const triggerHelper = {
  async executeEventParser(params: ExecuteEventParserOperation): Promise<ParseEventResponse | undefined> {
    const piece = pieces.find((p) => p.name === params.pieceName);
    if (piece === undefined) {
      throw new Error(`Piece is not found ${params.pieceName}`)
    }
    return piece.events?.parseAndReply({ payload: params.event });
  },
  async executeTrigger(params: ExecuteTriggerOperation): Promise<ExecuteTriggerResponse | unknown[]> {
    const flowTrigger: PieceTrigger = params.flowVersion.trigger as PieceTrigger;
    const piece = pieces.find((p) => p.name === flowTrigger.settings.pieceName);
    const trigger = piece?.getTrigger(flowTrigger.settings.triggerName);
    if (trigger === undefined) {
      throw new Error(`Piece trigger is not found ${flowTrigger.settings.triggerName} and piece name ${flowTrigger.settings.pieceName}`)
    }
    const variableService = new VariableService();
    const executionState = new ExecutionState();
    executionState.insertConfigs(params.collectionVersion);
    const resolvedInput = await variableService.resolve(flowTrigger.settings.input, executionState);
    const appListeners: { events: string[], identifierValue: string, identifierKey: string }[] = [];
    const context = {
      store: createContextStore(params.flowVersion.flowId),
      app: {
        async createListeners({ events, identifierKey, identifierValue }: { events: string[], identifierValue: string, identifierKey: string }) {
          appListeners.push({ events, identifierValue, identifierKey });
        }
      },
      webhookUrl: params.webhookUrl,
      propsValue: resolvedInput,
      payload: params.triggerPayload,
    };
    switch (params.hookType) {
      case TriggerHookType.ON_DISABLE:
        await trigger.onDisable(context);
        return {
          listeners: []
        }
      case TriggerHookType.ON_ENABLE:
        await trigger.onEnable(context);
        return {
          listeners: appListeners
        }
      case TriggerHookType.RUN:
        if (trigger.type === TriggerStrategy.APP_WEBHOOK) {
          if (params.edition === ApEdition.COMMUNITY) {
            return [];
          }
          if (!params.webhookSecret) {
            throw new Error(`Webhook secret is not avaiable for piece name ${flowTrigger.settings.pieceName}`)
          }
          try {
            const verified = piece?.events?.verify({ payload: params.triggerPayload as EventPayload, webhookSecret: params.webhookSecret });
            if (verified === false) {
              console.log("Webhook is not verified");
              return [];
            }
          } catch (e) {
            console.error("Error while verifying webhook", e);
            return [];
          }
        }
        return trigger.run(context as any);
    }
  },
}
