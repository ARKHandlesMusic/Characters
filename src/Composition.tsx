import { Composition, Folder } from "remotion";
import { BasePersonVideo } from "./guy";
import { EmberShowcaseVideo } from "./ember";
import { LumiShowcaseVideo } from "./lumi";
import { VillainShowcaseVideo } from "./villain";
import { ComicRoomVideo } from "./room-and-city";

export const MyComposition = () => {
  return (
    <>
      {/* 1. Guy: 54-Bone Rigged Red Beanie Guy */}
      <Folder name="1-Guy">
        <Composition
          id="Guy-Rig-4K"
          component={BasePersonVideo}
          durationInFrames={480}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{
            pose: "tpose",
            footwear: "socks",
            lightingMode: "day",
            heavier: 0,
            slimmer: 0,
            broader: 0,
            curvier: 0,
          }}
        />
      </Folder>

      {/* 2. Ember: Fully Rigged Raymarched SDF Mochi Ghost */}
      <Folder name="2-Ember">
        <Composition
          id="Ember-Rig-4K"
          component={EmberShowcaseVideo}
          durationInFrames={900}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{ speed: 1.0 }}
        />
      </Folder>

      {/* 3. Lumi: Fully Rigged Pink SDF Character & 3D Ruby Bowtie */}
      <Folder name="3-Lumi">
        <Composition
          id="Lumi-Rig-4K"
          component={LumiShowcaseVideo}
          durationInFrames={480}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{ speed: 1.0 }}
        />
      </Folder>

      {/* 4. Villain: Fully Rigged Obsidian SDF Character, Radar Antennas & Unzipping Mouth */}
      <Folder name="4-Villain">
        <Composition
          id="Villain-Rig-4K"
          component={VillainShowcaseVideo}
          durationInFrames={480}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{ speed: 1.0 }}
        />
      </Folder>

      {/* 5. Room and City: Comic-Print Bedroom & 25-Block 3D Metropolis */}
      <Folder name="5-Room-And-City">
        <Composition
          id="Room-Day-4K"
          component={ComicRoomVideo}
          durationInFrames={480}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{
            lightingMode: "day",
            cameraPreset: "wide",
          }}
        />
        <Composition
          id="Room-Night-4K"
          component={ComicRoomVideo}
          durationInFrames={480}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{
            lightingMode: "night",
            cameraPreset: "wide",
          }}
        />
        <Composition
          id="Room-Muted-4K"
          component={ComicRoomVideo}
          durationInFrames={480}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{
            lightingMode: "muted",
            cameraPreset: "desk",
          }}
        />
        <Composition
          id="Room-Window-4K"
          component={ComicRoomVideo}
          durationInFrames={480}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{
            lightingMode: "day",
            cameraPreset: "window",
          }}
        />
        <Composition
          id="City-Day-4K"
          component={ComicRoomVideo}
          durationInFrames={480}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{
            lightingMode: "day",
            cameraPreset: "city",
          }}
        />
        <Composition
          id="City-Night-4K"
          component={ComicRoomVideo}
          durationInFrames={480}
          fps={30}
          width={3840}
          height={2160}
          defaultProps={{
            lightingMode: "night",
            cameraPreset: "cityTour",
          }}
        />
      </Folder>
    </>
  );
};
