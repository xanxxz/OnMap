import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import {
  Server,
  Socket,
} from 'socket.io';

import {
  RoadEventRealtimePayload,
  RoadEventResolvedPayload,
} from '../road-events.types';

interface RoadEventsSubscriptionPayload {
  cityId: string;
}

const createCityRoom = (
  cityId: string,
): string => {
  return `road-events:${cityId}`;
};

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RoadEventsGateway {
  @WebSocketServer()
  private server!: Server;

  @SubscribeMessage(
    'road-events:subscribe',
  )
  async subscribe(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    payload:
      RoadEventsSubscriptionPayload,
  ) {
    if (
      !payload ||
      typeof payload.cityId !==
        'string' ||
      payload.cityId.length === 0
    ) {
      return {
        success: false,
      };
    }

    const room =
      createCityRoom(
        payload.cityId,
      );

    await client.join(
      room,
    );

    return {
      success: true,

      cityId:
        payload.cityId,
    };
  }

  @SubscribeMessage(
    'road-events:unsubscribe',
  )
  async unsubscribe(
    @ConnectedSocket()
    client: Socket,

    @MessageBody()
    payload:
      RoadEventsSubscriptionPayload,
  ) {
    if (
      !payload ||
      typeof payload.cityId !==
        'string' ||
      payload.cityId.length === 0
    ) {
      return {
        success: false,
      };
    }

    const room =
      createCityRoom(
        payload.cityId,
      );

    await client.leave(
      room,
    );

    return {
      success: true,

      cityId:
        payload.cityId,
    };
  }

  broadcastCreated(
    event:
      RoadEventRealtimePayload,
  ) {
    this.server
      .to(
        createCityRoom(
          event.cityId,
        ),
      )
      .emit(
        'road-event:created',
        event,
      );
  }

  broadcastUpdated(
    event:
      RoadEventRealtimePayload,
  ) {
    this.server
      .to(
        createCityRoom(
          event.cityId,
        ),
      )
      .emit(
        'road-event:updated',
        event,
      );
  }

  broadcastResolved(
    payload:
      RoadEventResolvedPayload,
  ) {
    this.server
      .to(
        createCityRoom(
          payload.cityId,
        ),
      )
      .emit(
        'road-event:resolved',
        payload,
      );
  }
}