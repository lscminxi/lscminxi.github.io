---
title: 图与函数测试
date: 2026-10-20 22:14:00
categories:
  - 学习笔记
---
```plot
title: 函数图像
f: x^2 - 2x + 1 ; color=red
f: -x + 3 ; color=green
points: (1, 0), (3, 2) ; connect=true ; color=blue
x: -3, 5
coords: on
intersections: on
```



```graph
title: 示例图
algo: reader
directed: true
node: A ; label=起点 ; color=red ; x=-16.07 ; y=-42.15
node: B ; x=31.09 ; y=19.51
node: C ; x=-95.26 ; y=55
edge: A -> B ; label=一步
edge: B -> C
edge: C -- A
```




```graph
title: 示例图
algo: mst
directed: true
node: A ; label=起点 ; color=red ; x=-0.58 ; y=-41.85
node: B ; x=95.26 ; y=55
node: C ; x=-95.26 ; y=55
edge: A -> B ; weight=1
edge: B -> C ; weight=2
edge: C -- A ; weight=5
```



