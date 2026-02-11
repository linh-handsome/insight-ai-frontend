import mediapipe as mp
import sys
print(f"Python: {sys.version}")
print(f"MediaPipe: {getattr(mp, '__version__', 'unknown')}")
print(f"Has solutions: {bool(hasattr(mp, 'solutions'))}")
if hasattr(mp, 'solutions'):
    print(f"Solutions: {list(mp.solutions.__dict__.keys())[:5]}")
else:
    print(f"Available attributes: {dir(mp)}")
