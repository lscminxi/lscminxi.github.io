---
title: 图与函数测试
date: 2026-10-20 22:14:00
categories:
  - 学习笔记
---
```plot
title: 函数图像
f: x^2 - 2x + 1 ; color=red ; label=抛物线
f: -x + 3 ; color=green ; label=直线
points: (1, 0), (3, 2) ; connect=true ; color=blue ; label=数据点
x: -3, 5
coords: on
intersections: on
equations: on
```



```graph
title: 示例图
directed: true
node: A ; label=起点 ; color=red
node: B
node: C
edge: A -> B ; label=一步
edge: B -> C
edge: C -- A
```


