"""Extrae manos, cara y pose de los videos de SAVb para las animaciones del diccionario.

A diferencia de los .npy de entrenamiento, conserva el video completo a 30 fps,
incluye las cejas y agrega hombros y codos. Escribe data/landmarks/<SEÑA>.json.gz,
que scripts/build-clips.mjs convierte en clips.

Uso: python scripts/extract_landmarks.py [--savb ruta] [--only AGUA PERRO] [--workers 8]
Requiere: pip install mediapipe opencv-python-headless
"""

from __future__ import annotations

import argparse
import gzip
import json
from multiprocessing import Pool
from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions, vision

ROOT = Path(__file__).resolve().parent.parent
TARGET_FPS = 30
UPSCALE_BELOW = 720
MIN_CONFIDENCE = 0.3

# Mismo orden que FACE_KEEP en build-clips.mjs y las posiciones de src/lib/hands.js.
FACE_KEEP = [
    10, 152, 234,  # cabeza
    33, 133, 145, 158,  # ojo
    263, 362, 374, 385,  # ojo
    168, 1,  # nariz
    61, 146, 91, 181, 84, 17, 314, 405, 321, 291, 409, 0, 185,  # labio exterior
    78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191,  # labio interior
    70, 63, 105, 66, 107,  # ceja
    336, 296, 334, 293, 300,  # ceja
]
POSE_KEEP = [11, 12, 13, 14, 15, 16]  # hombros, codos y muñecas


def landmarkers(models: Path):
    def base(name):
        return BaseOptions(model_asset_path=str(models / name))

    video = vision.RunningMode.VIDEO
    hands = vision.HandLandmarker.create_from_options(vision.HandLandmarkerOptions(
        base_options=base("hand_landmarker.task"), running_mode=video, num_hands=2,
        min_hand_detection_confidence=MIN_CONFIDENCE, min_hand_presence_confidence=MIN_CONFIDENCE,
        min_tracking_confidence=MIN_CONFIDENCE))
    face = vision.FaceLandmarker.create_from_options(vision.FaceLandmarkerOptions(
        base_options=base("face_landmarker.task"), running_mode=video, num_faces=1,
        min_face_detection_confidence=MIN_CONFIDENCE, min_tracking_confidence=MIN_CONFIDENCE))
    pose = vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(
        base_options=base("pose_landmarker_lite.task"), running_mode=video, num_poses=1,
        min_pose_detection_confidence=MIN_CONFIDENCE, min_tracking_confidence=MIN_CONFIDENCE))
    return hands, face, pose


def flat(points, indices=None, z=True):
    chosen = points if indices is None else [points[i] for i in indices]
    out = []
    for p in chosen:
        out += [round(p.x, 4), round(p.y, 4)]
        if z:
            out.append(round(p.z, 4))
    return out


def extract(args):
    video, models, out_dir = args
    capture = cv2.VideoCapture(str(video))
    fps = capture.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, round(fps / TARGET_FPS))
    scale = max(1, UPSCALE_BELOW // height)

    hands, face, pose = landmarkers(models)
    series = {"r": [], "l": [], "f": [], "p": []}
    index = 0
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        if index % step == 0:
            if scale > 1:
                frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            ms = int(index * 1000 / fps)
            found = hands.detect_for_video(image, ms)
            slots = {"r": None, "l": None}
            for points, side in zip(found.hand_landmarks, found.handedness):
                slot = "r" if side[0].category_name == "Right" else "l"
                if slots[slot] is not None:
                    slot = "l" if slot == "r" else "r"
                slots[slot] = flat(points)
            series["r"].append(slots["r"])
            series["l"].append(slots["l"])
            faces = face.detect_for_video(image, ms).face_landmarks
            series["f"].append(flat(faces[0], FACE_KEEP, z=False) if faces else None)
            poses = pose.detect_for_video(image, ms).pose_landmarks
            series["p"].append(flat(poses[0], POSE_KEEP, z=False) if poses else None)
        index += 1
    capture.release()
    for landmarker in (hands, face, pose):
        landmarker.close()

    result = {"fps": fps / step, "width": width, "height": height, **series}
    with gzip.open(out_dir / f"{video.stem}.json.gz", "wt", encoding="utf8", compresslevel=9) as file:
        json.dump(result, file, separators=(",", ":"))

    frames = len(series["r"])
    missing = {key: sum(v is None for v in values) for key, values in series.items()}
    return video.stem, frames, missing


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--savb", default=str(ROOT.parent / "SAVb"))
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--workers", type=int, default=8)
    options = parser.parse_args()

    savb = Path(options.savb)
    out_dir = ROOT / "data" / "landmarks"
    out_dir.mkdir(parents=True, exist_ok=True)
    videos = sorted((savb / "public" / "videos" / "signs").glob("*.mp4"))
    if options.only:
        videos = [v for v in videos if v.stem in options.only]

    jobs = [(video, savb / "mediapipe_models", out_dir) for video in videos]
    with Pool(options.workers) as pool:
        for done, (label, frames, missing) in enumerate(pool.imap_unordered(extract, jobs), 1):
            print(f"{done}/{len(jobs)} {label}: {frames} cuadros, faltan {missing}", flush=True)


if __name__ == "__main__":
    main()
