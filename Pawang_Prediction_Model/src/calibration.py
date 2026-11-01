"""Kalibrasi probabilitas yang disimpan sebagai JSON (tanpa pickle, aman lintas versi)."""
from __future__ import annotations

import numpy as np
from scipy.special import expit, logit
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression

_EPS = 1e-6


class Calibrator:
    def __init__(self, kind: str, params: dict):
        self.kind = kind
        self.params = params

    @classmethod
    def fit(cls, p_raw, y, min_pos_isotonic: int = 100) -> "Calibrator":
        p = np.clip(np.asarray(p_raw, dtype=float), _EPS, 1 - _EPS)
        y = np.asarray(y).astype(int)
        if y.sum() >= min_pos_isotonic:
            iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0).fit(p, y)
            return cls("isotonic", {"x": iso.X_thresholds_.tolist(), "y": iso.y_thresholds_.tolist()})
        lr = LogisticRegression(C=1e6, max_iter=1000).fit(logit(p).reshape(-1, 1), y)
        return cls("sigmoid", {"a": float(lr.coef_[0, 0]), "b": float(lr.intercept_[0])})

    def transform(self, p_raw) -> np.ndarray:
        p = np.clip(np.asarray(p_raw, dtype=float), _EPS, 1 - _EPS)
        if self.kind == "isotonic":
            return np.interp(p, self.params["x"], self.params["y"])
        return expit(self.params["a"] * logit(p) + self.params["b"])

    def to_dict(self) -> dict:
        return {"kind": self.kind, "params": self.params}

    @classmethod
    def from_dict(cls, d: dict) -> "Calibrator":
        return cls(d["kind"], d["params"])
