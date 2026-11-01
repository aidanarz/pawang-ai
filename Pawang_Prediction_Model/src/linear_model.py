"""Regresi logistik ber-regularisasi yang disimpan sebagai JSON (tanpa pickle, aman lintas versi).

Antarmukanya meniru bagian XGBClassifier yang dipakai pipeline: `predict_proba(X)[:, 1]`,
`save_model(path)`, `LinearModel.load(path)`.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.special import expit
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler


class LinearModel:
    def __init__(self, features, median, mean, scale, coef, intercept, C=None):
        self.features = list(features)
        self.median = np.asarray(median, dtype=float)
        self.mean = np.asarray(mean, dtype=float)
        self.scale = np.asarray(scale, dtype=float)
        self.coef = np.asarray(coef, dtype=float)
        self.intercept = float(intercept)
        self.C = C

    @classmethod
    def fit(cls, X: pd.DataFrame, y, C: float = 0.01) -> "LinearModel":
        imp = SimpleImputer(strategy="median").fit(X)
        Z = imp.transform(X)
        sc = StandardScaler().fit(Z)
        lr = LogisticRegression(C=C, class_weight="balanced", max_iter=1000).fit(sc.transform(Z), y)
        return cls(X.columns, imp.statistics_, sc.mean_, sc.scale_, lr.coef_[0], lr.intercept_[0], C)

    def _z(self, X) -> np.ndarray:
        A = np.asarray(X[self.features] if isinstance(X, pd.DataFrame) else X, dtype=float)
        A = np.where(np.isnan(A), self.median, A)
        return (A - self.mean) / np.where(self.scale == 0, 1.0, self.scale)

    def predict_proba(self, X) -> np.ndarray:
        p = expit(self._z(X) @ self.coef + self.intercept)
        return np.column_stack([1 - p, p])

    def importance(self) -> dict:
        """|koefisien| pada fitur terstandar, urut menurun."""
        return dict(sorted(((f, float(abs(c))) for f, c in zip(self.features, self.coef)),
                           key=lambda kv: -kv[1]))

    def save_model(self, path) -> None:
        Path(path).write_text(json.dumps({
            "type": "logistic", "features": self.features, "C": self.C, "median": self.median.tolist(),
            "mean": self.mean.tolist(), "scale": self.scale.tolist(), "coef": self.coef.tolist(),
            "intercept": self.intercept}, indent=2))

    @classmethod
    def load(cls, path) -> "LinearModel":
        d = json.loads(Path(path).read_text())
        return cls(d["features"], d["median"], d["mean"], d["scale"], d["coef"], d["intercept"], d.get("C"))
