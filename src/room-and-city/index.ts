export { ComicBedroom, type ComicBedroomProps } from "./ComicBedroom";
export { ComicCityWorld, type ComicCityWorldProps } from "./ComicCityWorld";
export { CityInstancedDistrict, type CityInstancedDistrictProps } from "./CityInstancedDistrict";
export {
  ComicRoomScene,
  ComicRoomVideo,
  type ComicRoomSceneProps,
  type ComicRoomVideoProps,
} from "./ComicRoomVideo";
export {
  type BuildingSpec,
  type CameraFrameState,
  type CarSpec,
  type CityLayout,
  type CloudSpec,
  type FootpathSegment,
  type MountainSpec,
  type Rect2D,
  type RoadSegment,
  type RoomCameraPreset,
  type RoomLightingMode,
  type StreetLampSpec,
  type TreeSpec,
  BOULEVARD_CENTER_X,
  BOULEVARD_ROAD_W,
  CITY_GROUND_Y,
  FOOTPATH_W,
  WINDOW_FACADE_COLS,
  WINDOW_FACADE_PAD_X,
  WINDOW_FACADE_ROWS,
  computeTextureAlignedBalconyRows,
  evaluateRoomCamera,
  generateCityLayout,
  getComicLightingConfig,
  verifyCityNoOverlaps,
} from "./comicRoomPresets";
export {
  type ComicLightingConfig,
  type ComicPrintMaterialOptions,
  createComicOutlineMaterial,
  createComicPrintMaterial,
  createComicSkyMaterial,
  syncComicPrintMaterial,
} from "./comicPrintShader";
