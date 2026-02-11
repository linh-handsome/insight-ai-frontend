import mediapipe as mp
try:
    print(f"MediaPipe version: {mp.__version__}")
    print(f"Solutions: {dir(mp.solutions)}")
    print("Successfully accessed mp.solutions")
except AttributeError as e:
    print(f"Error: {e}")
    print(f"MediaPipe members: {dir(mp)}")
