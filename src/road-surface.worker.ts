import {
  generateRoadSurface,
  type RoadSurfaceOptions,
  type RoadSurfaceResult,
} from "optbv-roadpolylgon";

type GenerationRequest = {
  id: number;
  options: RoadSurfaceOptions;
};

type GenerationResponse = {
  id: number;
  result?: RoadSurfaceResult;
  error?: string;
};

self.onmessage = (event: MessageEvent<GenerationRequest>) => {
  const { id, options } = event.data;
  void generateRoadSurface(options).then(
    (result) => {
      const response: GenerationResponse = { id, result };
      self.postMessage(response);
    },
    (error: unknown) => {
      const response: GenerationResponse = {
        id,
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(response);
    }
  );
};
