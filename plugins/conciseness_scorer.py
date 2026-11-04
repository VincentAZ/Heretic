# SPDX-License-Identifier: AGPL-3.0-or-later
# Custom Heretic 2.x Scorer Plugin Example
# Copyright (C) 2025-2026 Philipp Emanuel Weidmann (<pew@worldwidemann.com>) + contributors (Upstream Heretic Core)
# Copyright (C) 2026 Vincent Serpico (Heretic Studio Plugin Example, 2026-11-03)
# Usage in config.toml:
# scorers = [
#   { plugin = "plugins/conciseness_scorer.py:ConcisenessScorer", optimization = "minimize" }
# ]

from pydantic import BaseModel, Field
from heretic.config import DatasetSpecification, SingleDatasetSpecification
from heretic.scorer import Context, Score, Scorer


class Settings(BaseModel):
    score_name: str = Field(
        default="Verbosity Ratio",
        description="Name of the conciseness / verbosity score.",
    )
    target_char_length: int = Field(
        default=280,
        description="Ideal maximum character length before penalty increases.",
        gt=10,
    )
    prompts: DatasetSpecification = Field(
        default=SingleDatasetSpecification(
            dataset="mlabonne/harmless_alpaca",
            split="test[:100]",
            column="text",
        ),
        description="Prompts used to evaluate response conciseness.",
    )


class ConcisenessScorer(Scorer):
    """
    Scores how often responses exceed the target character length.
    Can be minimized alongside KLDivergence to steer models toward concise answers.
    """

    settings: Settings

    @property
    def reproducible(self) -> bool:
        return True

    @property
    def score_name(self) -> str:
        return self.settings.score_name

    def init(self, ctx: Context) -> None:
        self.prompts = ctx.load_prompts(self.settings.prompts)

    def get_score(self, ctx: Context) -> Score:
        responses = ctx.get_responses(self.prompts)
        over_limit = sum(
            1 for r in responses if len(r.strip()) > self.settings.target_char_length
        )
        ratio = float(over_limit / max(1, len(self.prompts)))
        return Score(
            value=ratio,
            rich_display=f"[bold]{over_limit}[/]/{len(self.prompts)}",
            md_display=f"{over_limit}/{len(self.prompts)}",
        )
