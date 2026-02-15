import "./style.css";
import { parseGpx, mapRuns, setupMap, type Run } from "./utils";

const map = setupMap();

const speedInput = document.getElementById("speed-input") as HTMLInputElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const playButton = document.getElementById("play-button") as HTMLButtonElement;
playButton.addEventListener("click", async () => {
  const fileList = fileInput.files;
  if (!fileList || fileList.length === 0) {
    alert("Please select at least one GPX file to play.");
    return;
  }

  const promises: Promise<Run>[] = Array.from(fileList).map((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          if (typeof reader.result !== "string")
            throw new Error("Invalid result type");
          const run = parseGpx(reader.result);
          console.log(`Successfully parsed ${file.name}`);
          resolve(run);
        } catch (error) {
          console.error(`Error parsing ${file.name}:`, error);
          reject(error);
        }
      };
      reader.onerror = () => {
        console.error(`Error reading ${file.name}`);
        reject(new Error("Read error"));
      };
      reader.readAsText(file);
    });
  });

  const results = await Promise.allSettled(promises);

  const validRuns = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (validRuns.length === 0) {
    alert("No valid GPX files could be loaded. Check console for errors.");
    return;
  }

  speedInput.disabled = true;
  fileInput.disabled = true;
  playButton.disabled = true;

  mapRuns(map, validRuns, speedInput.valueAsNumber || 10);
});
