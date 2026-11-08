---
title: 题解 ABC483E
date: 2026-11-08 13:27:00
categories:
  - 题解
tags:
  - 字符串
  - 容斥原理
  - 组合数学
---
先考虑一下怎么去处理汉明距离。

直接统计汉明距离恰好为 $0,1,2$ 的数量比较难，考虑统计汉明距离分别小于等于 $0,1,2$ 的数量在容斥。

注意到题目中 $m$ 很小，考虑将一个字符串的任意两位替换成特殊字符，这样一个字符串会衍生出 $\dbinom{m}{2}$ 个字符串。考虑到对于一个衍生串 $X_1$，设它的原串为 $Y_1$，设另一个于 $X_1$ 完全相同的衍生串为 $X_2$，它的原串 $Y_2$ 于 $Y_1$ 的汉明距离小于等于 $2$。

用一个桶维护替换后衍生出来的字符串的出现次数。设 $x$ 为桶中一个字符串的出现次数，设 $t_2=\sum x^2$。同理，通过将字符串的任意一位替换成特殊字符，再用同样的方法求出 $t_1$。

实际上 $t_2$ 与 $t_1$ 分别包含了汉明距离为 $2$ 或 $1$ 的有序字符串对 $(i,j)$（包含 $i=j$）的数量，但是还需要去重处理。

分别设 $c_0,c_1,c_2$ 表示汉明距离为 $0,1,2$ 的有序字符串对 $(i,j)$（包含 $i=j$）的数量，答案即为 $\dfrac{c_0+c_1+c_2-n}{2}$。

$c_0$ 直接用桶计数即可得到，根据容斥：

- 在 $t_1$ 中，汉明距离为 $0$ 的字符串对被算了 $m$ 次，所以 $c_1=t_1-mc_0$。
- 在 $t_2$ 中，汉明距离为 $0$ 的字符串对被算了 $\dbinom{m}{2}$ 次，而汉明距离为 $1$ 的字符串对被算了 $m-1$ 次，所以 $c_2=t_2-\dbinom{m}{2}c_0-(m-1)c_1$。

:::success[code]
```cpp line-numbers
#include <bits/stdc++.h>
#include <ext/pb_ds/assoc_container.hpp>
#include <ext/pb_ds/hash_policy.hpp>
using namespace __gnu_pbds;
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=2e5;

int n,m;
gp_hash_table<int,ll> mp1,mp2,mp3;
ll tot1,tot2,tot3;
//对应题解中的 t0,t1,t2，t0=c0
ll cnt1,cnt2,cnt3;
//对应题解中的 c0,c1,c2
ll ans;

int toint(string str){
	int num=0;
	for(auto x:str){
		num*=27;
		if(x=='#') num+=26;
		else num+=x-'a';
	}
	return num;
}

int main(){
    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

	cin>>n>>m;
	for(int i=1;i<=n;i++){
		string str;
		cin>>str;
		mp1[toint(str)]++;
		for(int j=0;j<m;j++){
			char x=str[j];
			str[j]='#';
			mp2[toint(str)]++;
			for(int k=j+1;k<m;k++){
				char y=str[k];
				str[k]='#';
				mp3[toint(str)]++;
				str[k]=y;
			}
			str[j]=x;
		}
	}

	for(auto X:mp1){
		ll tis=X.second;
		tot1+=tis*tis;
	}

	for(auto X:mp2){
		ll tis=X.second;
		tot2+=tis*tis;
	}

	for(auto X:mp3){
		ll tis=X.second;
		tot3+=tis*tis;
	}

	cnt1=tot1;
	cnt2=tot2-cnt1*m;
	cnt3=tot3-(m*(m-1)/2)*cnt1-(m-1)*cnt2;

	cout<<(cnt1+cnt2+cnt3-n)/2;
	
	the_end
}

```
:::
