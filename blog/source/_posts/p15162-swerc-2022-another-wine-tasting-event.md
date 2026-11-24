---
title: "P15162 [SWERC 2022] Another Wine Tasting Event"
date: 2026-11-24 18:54:00
categories:
  - 题解
tags:
  - 贪心
  - Ad-hoc
---
由于每一个人都至少要选择一段长为 $n$ 的区间，所以考虑所有长为 $n$ 的区间中白葡萄酒数量最多的区间 $[l,r]$。设区间 $[l,r]$ 中有 $x$ 瓶白葡萄酒。

现在考虑将这个区间向左扩展，如果左边是一瓶红葡萄酒，那么直接扩展就可以了。

如果现在左边是一瓶白葡萄酒，那么就让区间的右端点 $r$ 缩小到现在这个区间的最靠右的一瓶白葡萄左边，这样就可以保持白葡萄酒的数量不变。

可以证明此时区间长度一定大于等于 $n$，假设现在的区间是 $[l',r']$ 且长度小于 $n$，那么根据刚才的规则可知现在 $[l',r']$ 中有 $x$ 瓶白葡萄酒且位置 $r'+1$ 也是一瓶白葡萄酒，那么区间 $[l',r'+1]$ 中的白葡萄酒数量为 $x+1$，而且这个区间也一定小于等于 $n$。如果这个区间存在，那区间 $[l,r]$ 就不是长为 $n$ 中有最多瓶白葡萄酒的区间，与定义不符，故区间 $[l',r']$ 的长度一定大于等于 $n$。

向右扩展同理。

容易得到区间 $[l,r]$ 可以向左扩展出 $l-1$ 个区间，向右扩展出 $2n-1-r+1=2n-r$ 个区间，一共就可以扩展出 $2n-r+l-1$ 个区间，由于区间 $[l,r]$ 长为 $n$，即 $r-l+1=n$，所以一共可以扩展出 $2n-(r-l+1)=n$ 个区间，符合题意。于是找到这个 $x$ 就可以了，这个 $x$ 是好找的。

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long
#define ull unsigned long long
#define the_end return 0;

const int N=1e6;

ll n,cnt[2*N+1];
string str;

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

	cin>>n>>str;
	str=" "+str;
	for(int i=1;i<n*2;i++){
		cnt[i]=cnt[i-1]+(str[i]=='W');
	}

	ll ans=0;
	for(int i=1;i<=n;i++){
		ans=max(ans,cnt[i+n-1]-cnt[i-1]);
	}
	cout<<ans;

	the_end
}
```
:::
