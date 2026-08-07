export const DEMO_TEXT = String.raw`## 需要估计的四个分量

先得到 global/local 图像因素的 marginal contrast (D_G(q),D_L(q))，再用单位范数问题 contrast：

[
w_0=(1,1,1)/\sqrt3,\quad
w_G=(2,-1,-1)/\sqrt6,\quad
w_L=(-1,2,-1)/\sqrt6
]

定义：

[
M_G=\sum_q w_0(q)D_G(q),\qquad
C_L=\sum_q w_L(q)D_L(q)
]

其中：

- (M_G)：目标 global semantic summary；
- (C_L)：local fact × local-question relevance interaction。

阶段                    实验                                      通过条件
━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-1. Forward validity    透传 mm_token_type_ids；清空 rope_deltas   排除位置编码和跨样本状态污染
──────────────────────  ────────────────────────────────────────  ───────────────────────────────
0. Behavioral ceiling   四图×三问题 direct answer                  确认模型识别 donor/target 事实
──────────────────────  ────────────────────────────────────────  ───────────────────────────────
1. Geometry / R         捕获全部层固定 pre-answer state            证明同一 residual 中效应共存

同一 residual 共存要求 held-out unique partial (R^2>0)，并量化：

[
h_{11}-h_{10}-h_{01}+h_{00}
]

普通括号（这不是公式）以及代码 ${"`value_(raw)`"} 应保持原样。`;
