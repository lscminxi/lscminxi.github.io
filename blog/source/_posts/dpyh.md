---
title: DP 优化杂题
date: 2026-10-15 18:19:00
categories:
  - 学习笔记
tags:
  - 动态规划
  - 总结
---
## [CF505C](https://www.luogu.com.cn/problem/CF505C)

:::info[简化题面]
给出 $n$ 个宝石的坐标，初始在位置 $0$，最开始你的跳跃长度为 $d$，你只能往前跳，如果你上一次的跳跃长度为 $x$，那么下一次的跳跃长度可以为 $[x-1,x+1]$，求你最多能收集到的宝石数。
:::

首先考虑朴素 dp，设 $f_{i,j}$ 为现在在位置 $i$，上一步的跳跃长度为 $j$ 的情况下可收集到的最多宝石数。

易得转移方程 $f_{i,j}=\max_{k\in [j-1,j+1]}\{f_{i-1,k}+cnt_i\}$，$cnt_i$ 为位置 $i$ 的宝石数。

考虑优化，注意到最大坐标只有 $30000$，设最大坐标为 $n$，所以这里有许多状态是无效的，由于只能一直往前跳，于是构造最多跳跃次数为 $d,d-1,d-2,d-3\ldots$，这种情况下，跳跃长度的上下界大约为 $[d-\sqrt{n},d+\sqrt{n}]$，取 $[d-250,d+250]$ 即可。

时间复杂度 $\mathcal{O}(n\sqrt{n})$，空间相同。

:::success[Code]

```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=30000;

ll n,d,m,ans;
ll cnt[N+10],f[N+10][510];

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    cin>>n>>d;
    for(int i=1;i<=n;i++){
        ll x;
        cin>>x;
        cnt[x]++;
        m=max(m,x);
    }

    memset(f,-1,sizeof f);

    f[d][250]=cnt[d];
    ans=f[d][250];

    for(int i=1;i<=m;i++){
        for(int j=0;j<=500;j++){
            int x=d+j-250;
            if(i<x || x<=0 || (i==d && j==250)){
                continue;
            }
            if(j!=0){
                f[i][j]=max(f[i-x][j],f[i-x][j-1]);
            }
            if(j!=500){
                f[i][j]=max({f[i-x][j+1],f[i-x][j],f[i][j]});
            }
            if(f[i][j]!=-1){
                f[i][j]+=cnt[i];
                ans=max(f[i][j],ans);
            }
        }
    }

    cout<<ans;

    the_end
}
```
:::

> 优化 dp 时，可以通过题目的特殊性质以去除无效状态。

## [CF510D](https://www.luogu.com.cn/problem/CF510D)

:::info[简化题面]
给你 $n$ 种步长 $l_i$，获得每种步长需要 $c_i$ 元，求你至少要花多少钱才能使得你能到达任意一个地点。
:::

容易考虑到能到达任意地点的充要条件是 $\gcd_{i\in S} \{l_i\}=1$，其中 $S$ 为你获得的步长下标集合。

那么考虑 $f_{i,j}$ 表示已经处理了前 $i$ 种步长，其中你获得的步长的 $\gcd$ 为 $j$。转移是好想的，而容易证明不同子集产生的 $\gcd$ 的数量是 $\log n$ 级别的，用 `map` 维护一下即可。

:::success[Code]

```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=300;

ll n,l[N+10],val[N+10];
map<ll,ll> f,g; 

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    cin>>n;
    for(int i=1;i<=n;i++){
        cin>>l[i];
    }

    for(int i=1;i<=n;i++){
        cin>>val[i];
    }

    f[0]=0;

    for(int i=0;i<n;i++){
        g=f;
        for(auto x:f){
            int nex=__gcd(x.first,l[i+1]);
            if(g.count(nex)){
                g[nex]=min(g[nex],f[x.first]+val[i+1]);              
            }
            else {
                g[nex]=f[x.first]+val[i+1];
            }
        }
        f=g;
        //cout<<endl;
    }

    if(f.count(1))cout<<f[1];
    else cout<<-1;

    the_end
}
```
:::

> 可以考虑从比较少的状态入手。

## [牛客210734](https://ac.nowcoder.com/acm/problem/210734)

:::info[简化题面]
给出 $n$ 个数 $a_i$，你需要选出恰好 $m$ 个不交区间，使得和最大。
:::

站外题，原题过于简单，这里着重写仅保证 $m \le n$ 的情况。

首先考虑朴素 dp 的情况，做一个前缀和，设 $sum_i=\sum_{j=1}^{i} a_i$，$f_{i,x}$ 表示 $[1,i]$ 选择 $x$ 个区间段的最大值。

易得转移方程： 

$$f_{i,x}=\max_{j\le i}\{sum_i-sum_j+\max_{k\le j}\{f_{k,x-1}\}\}$$

$\max_{k\le j}\{f_{k,x-1}\}$ 很好求，设 $pre_j=\max_{k\le j}\{f_{k,x-1} \}$，可以 $\mathcal{O}(1)$ 求。

于是转移方程变为：

$$
f_{i,x}=sum_i-\max_{j\le i}\{sum_j+pre_j\}
$$

维护一下 $\max_{j\le i}\{sum_j+pre_j\}$ 即可。~~（原题到这里就能过了）~~

现在考虑去掉段数，注意到当 $i$ 为定值时，以 $(x,f_{i,x})$ 为点的图形构成一个凸包，于是便可以用 WQS。

一个感性的证明是最开始有负数是考虑把负数都排除在区间之外，此时段数越多越高，当负数都被排除完以后就只能将整数排除在外，此时段数越小越好。

这里简单说明一下 WQS，将方程以 $(k,f_k)$ 作为点放置到平面直角坐标系上，如果这是一个凸包，那么我们就可以用一个合适的斜率 $m$ 的直线 $y=mx+b$ 去切这个凸包，那么 $\max\{b\}=\max\{y-mx\}$，由于前面我们定义 $y$ 是 $f_x$，所以 $\max\{b\}=\max\{f_x-mx\}$。

于是我们可以考虑找到这个 $b$，每次增加一条段时加上一个权值 $val$，如果最后选择的段数 $x$ 大于 $m$，就增加 $val$ 的大小，反之则减少。

这个 $val$ 的取值范围为 $[-\sum a_i,\sum a_i]$，时间复杂度为 $\mathcal{O}(n \log \sum a_i)$。

:::success[Code]

```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=1e6;

struct Node{
	ll x,seg;
};

ll n,k;
ll a[N+10],sum[N+10];
Node f[N+10],pre,gre;

inline Node check(ll cost){

	// f_i=sum_i+max{pre_j-sum_j}+cost
	//gre = pre_j
	f[0]=pre=gre={0,0};
	for(int i=1;i<=n;i++){
		f[i].x=sum[i]+pre.x+cost;
		f[i].seg=pre.seg+1;

		if(gre.x<f[i].x){
			gre=f[i];
		}
		else if(gre.x==f[i].x && gre.seg>f[i].seg){
			gre=f[i];
		}

		if(pre.x<gre.x-sum[i]){
			pre={gre.x-sum[i],gre.seg};
		}
		else if(pre.x==gre.x-sum[i] && pre.seg>gre.seg){
			pre={gre.x-sum[i],gre.seg};
		}
	}

	Node res={0,0};

	for(int i=1;i<=n;i++){
		if(res.x<f[i].x){
			res=f[i];
		}
		else if(res.x==f[i].x && res.seg>f[i].seg){
			res=f[i];
		}
	}

	return res;
}

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

	cin>>n>>k;
	for(int i=1;i<=n;i++){
		cin>>a[i];
		sum[i]=sum[i-1]+a[i];
	}

	Node ans={0,0};

	ll L=-1e15,R=1e15,res=0;
	while(L<=R){
		ll Mid=(L+R)>>1;
		Node tot=check(Mid);
		if(tot.seg>k){
			R=Mid-1;
		}
		else {
			res=Mid;
			L=Mid+1;
		}
	}

	ans=check(res);
	cout<<ans.x-k*res;
	
	the_end
}
```

:::

> 板题，不过可以考虑一些典型的优化方法。

## [P11311](https://www.luogu.com.cn/problem/P11311)

:::info[简化题面]
有 $n$ 个点，每个点要涂颜色 $a_i$。如果你要给区间 $[l,r]$ 上色，那么需要花费 $cnt^2$ 的代价，其中 $cnt$ 为 $[l,r]$ 中不同颜色的数量。

求给 n 个点上色的最小代价。
:::

先考虑朴素 dp，设 $f_i$ 表示给区间 $[1,i]$ 上色需要的最小代价，显然有转移方程 $f_i=\min \{f_j+cnt^2\}$，其中 $cnt$ 为 $[l,r]$ 中不同颜色的数量。

这种转移是 $\mathcal{O}(n^2)$ 的，观察转移方程，发现对 $i$ 有贡献的 $j$ 都是每种颜色在 $[1,i]$ 中最后出现的位置。于是设 $[1,i]$ 中每种颜色最后出现的下标位置集合为 $S$。转移方程优化为 $f_i=\min_{j\in S} \{f_j+cnt^2\}$。虽然现在看似还是 $\mathcal{O}(n^2)$ 的，但是实际上 $cnt^2\ge f_i$ 是一定不优的，而 $f_i$ 的下界为 $i$，于是对于每一个 $i$，有效的 $j$ 都不超过 $\sqrt{i}$ 个，总时间为 $\mathcal{O}(n\sqrt{n})$。

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=50000;

ll n;
ll a[N+10],b[N+10];
ll suf[N+10],f[N+10];
set<int> Set;

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    cin>>n;
    for(int i=1;i<=n;i++){
        cin>>a[i];
        b[i]=a[i];
    }
    
    sort(b+1,b+1+n);
    int len=unique(b+1,b+1+n)-b-1;

    for(int i=1;i<=n;i++){
        a[i]=lower_bound(b+1,b+1+len,a[i])-b;
    }

    for(int i=1;i<=n;i++){
        f[i]=1e18;
        if(suf[a[i]]){
            Set.erase(-suf[a[i]]);
        }
        ll w=1;
        for(auto it=Set.begin();it!=Set.end();it++){
            int j=-*it;
            f[i]=min(f[i],f[j]+w*w);
            w++;
            if(w*w>=f[i]){
                break;
            }
        }
        f[i]=min(f[i],w*w);
        suf[a[i]]=i;
        Set.insert(-i);
    }
    //O(n\sqrt{n})

    cout<<f[n];

    the_end
}
```
:::

>优化时可以考虑在转移方程中去掉无效的转移项，再在新的转移方程上找性质优化。

## [SP6562](https://www.luogu.com.cn/problem/SP6562)

~~you have no egg~~

:::info[简化题面]

多测。

每次给出 $B$ 个鸡蛋，在大于 $M$ 层的高度扔鸡蛋会碎，碎掉的鸡蛋不能再用，求找到 $M$ 的最少实验次数。
:::

朴素的 dp 是设 $f_{i,j}$ 表示有 $i$ 个蛋测出 $j$ 层花的最小楼层，这样依赖鸡蛋的破碎楼层，每次多测都要计算一次，时间复杂度 $\mathcal{O}(TBM)$。

考虑在时间复杂度中优化掉多测，那么状态中就不能出现楼层，于是重新定义状态，考虑 $g_{i,j}$ 表示用 $i$ 个蛋和 $j$ 次实验最多能覆盖多少层的测试。现在在随意的位置做一次实验，假设这个蛋碎了，那么接下来的实验会在这层下面，最多能覆盖 $g_{i-1,j-1}$ 层，如果没碎，接下来的实验会在这一层上面，最多能覆盖 $g_{i,j-1}$，加上本层，得出转移方程 $g_{i,j}=g_{i-1,j-1}+g_{i,j-1}+1$。注意到这个转移不受一个蛋的强度，所以可以预处理，最后在通过二分找一下最小试验次数，综合时间复杂度为 $\mathcal{O}(BM+T \log M)$。

:::success[Code]
```cpp line-number
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=1000;
const int M=50;

ll f[N+10][M+10];

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    for(int i=1;i<=N;i++){
        for(int j=1;j<=M;j++){
            f[i][j]=f[i-1][j-1]+f[i-1][j]+1;
            if(f[i][j]>=1001) f[i][j]=1001;
        }
    }

    int _;
    cin>>_;
    while(_--){
        int opt,b,m;
        cin>>opt>>b>>m;
        int L=0,R=N,ans=0;
        while(L<=R){
            int Mid=(L+R)>>1;
            if(f[Mid][b]>=m){
                R=Mid-1;
                ans=Mid;
            }
            else {
                L=Mid+1;
            }
        }
        cout<<opt<<" "<<ans<<endl;
    }

    the_end
}
```
:::

> 如果要去掉某些限制，可以考虑重新定义状态以去除限制。

## [CF1348E](https://www.luogu.com.cn/problem/CF1348E)

:::info[简化题意]
有 $n$ 个果园，每个果园有 $a_i$ 个红果和 $b_i$ 个蓝果，每个篮子可以装 $m$ 个果子，要求每个篮子装的水果颜色一样或产出地一样，求最多能装满多少个篮子。
:::

直接考虑 dp 不太好考虑，可以先考虑上下界。

设 $suma=\sum a_i$，$sumb=\sum b_i$，先只考虑颜色相同的果篮，易证可装满的篮子的上界为 $\lfloor \frac{(suma+sumb)}{m}\rfloor$，下界为 $\lfloor \frac{suma}{m} \rfloor + \lfloor \frac{sumb}{m} \rfloor$。

注意到这个上下界的差值最多为 $1$，而且差值的造成是因为 $suma \bmod m +sumb \bmod m> m$。

考虑用一个产出地一样的果篮来使得达到上界。

设 $f_{i,j}$ 表示在第 $i$ 个果园中，是否可以在装满一个篮子且使得剩余的红果数量为 $j$。

考虑转移，如果现在的 $f_{i,j}$ 可行，那么 $f_{i+1,(j+k) \bmod m}$ 可行的条件即为 $k \le a_{i+1}$ 且 $(m-k) \le b_{i+1}$。

于是可以做到 $\mathcal{O}(nk^2)$ 转移，假设第 $i$ 个果园可以消除上界和下界差，那么设这个篮子取了 $x$ 个红果，为了使得 $(suma-x) \bmod m +(sumb+m-x) \bmod m < m$，需要满足 $x \in [suma \bmod k,m-(sumb \bmod k)]$。

代码使用了一种比较直观的判断，实际上做法是一样的。

:::success[Code]

```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=1000;
const int M=50;

ll n,m;
ll a[N+10],b[N+10];
ll suma,sumb;
bool f[N+10][N+10];

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    cin>>n>>m;
    for(int i=1;i<=n;i++){
        cin>>a[i]>>b[i];
        suma+=a[i];
        sumb+=b[i];
    }

    if((suma+sumb)/m==suma/m+sumb/m){
        cout<<(suma+sumb)/m;
        the_end;
    }

    f[0][0]=1;

    for(int i=1;i<=n;i++){//sum_i a_i
        for(int j=0;j<m;j++){
            f[i][j]=f[i-1][j];
            if(f[i-1][j]==0) continue;
            for(int k=1;k<m;k++){
                if(k<=a[i] && (m-k)<=b[i]){
                    f[i][(j+k)%m]=1;
                }
            }
        }

        for(int j=0;j<m;j++){
            if(f[i][j]){
                int ra=(suma%m+(m-j))%m;
                int rb=(sumb%m+j)%m;
                if((ra+rb)%m!=(suma+sumb)%m) continue;
                cout<<(suma+sumb)/m;
                the_end
            }
        }
    }
    
    cout<<(suma+sumb)/m-1;

    the_end
}
```
:::

> 有些时候可以考虑答案的上下界在设状态。

## [CF1188C](https://www.luogu.com.cn/problem/CF1188C)

:::info[简化题意]
设一个数组 $b$ 的价值为 $\min_{1\le i<j\le|b|}\{|b_i-b_j|\}$。

现在给定序列 $a$ 和一个 $k$，要求求出 $a$ 的所有长为 $k$ 的子序列的价值之和。

答案对 $998244353$ 取模。
:::

先对 $a$ 排序，易得这样不会影响答案。

发现一个价值的上界是 $\dfrac{\max a_i}{k-1}$，因为最多有 $k-1$ 个空格。

考虑枚举数组的价值之和 $v \in [1,\dfrac{\max a_i}{k-1}]$，直接算有点难，可以考虑设 $f_{i,j}$ 为在前 $i$ 个数中选出来 $j$ 个数且价值大于等于 $v$ 的方案数，转移方程显然，为 $f_i=\sum_{a_i-a_k\ge v} f_k$。可以用双指针前缀和优化。

然后再差分即可。

代码中的统计比较特殊，由于 $f_{i,j}$ 表示大于等于 $v$ 的和，于是价值为 $v$ 的答案会贡献 $v$ 次，直接累加刚好贡献了 $v$ 次。

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=1000;
const int Mod=998244353;

ll n,k;
ll a[N+10];
ll f[N+10][N+10],g[N+10][N+10];

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

	cin>>n>>k;
    for(int i=1;i<=n;i++){
        cin>>a[i];
    }

    sort(a+1,a+1+n);
    a[0]=LLONG_MIN;

    ll ans=0;
    for(int v=1;v*(k-1)<=a[n];v++){
        ll sum=0;
        g[0][0]=f[0][0]=1;
        int L=0;
        for(int i=1;i<=n;i++){
            while(a[L]<=a[i]-v){
                L++;
            }
            for(int j=0;j<=k;j++){
                if(j)f[i][j]=g[L-1][j-1];
                g[i][j]=(g[i-1][j]+f[i][j])%Mod;
            }
            sum+=f[i][k];
        }
        ans=(ans+sum)%Mod;
    }

    cout<<ans;

    the_end
}
```
:::

> 可以考虑先排序，做差分的方法简化转移难度。

## [P6090](https://www.luogu.com.cn/problem/P6090)

:::info[简化题意]
给出 $n$ 个单词，长度均小于 $10$，每个单词可以在合法的立方体的任意一条边上出现。求可以构造多少种不同的立方体，对 $998244353$ 取模。
:::

可以分成 $4$ 个部分，每次考虑三条边和这三条边的共同点。设 $f_{i,j,k}$ 为固定长度下，除去公共点外的另外三个点分别为 $i,j,k$ 的方案数。容易得到 $f_{i,j,k}=g_{p,i} \times g_{p,j} \times g_{p,k}$，其中 $g_{i,j}$ 表示固定长度下开头为 $i$，结尾为 $j$ 的单词数量，而 $p$ 是公共点。

现在统计答案，容易想到统计四个不确定点，答案为 $\sum f_{i,j,k} \times f_{i,j,p} \times f_{i,k,p} \times f_{j,k,p}$。

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=100000;
const int M=10;
const int K=66;
const ll Mod=998244353;

int Int(char c){
	if(c>='a'&&c<='z')return(c-'a')+1;
	if(c>='A'&&c<='Z')return(c-'A')+27;
	if(c>='0'&&c<='9')return(c-'0')+53;
    the_end
}

int n;
string str;
unordered_map<string,bool> mp;
ll g[M+10][K+10][K+10];
ll f[M+1][K+10][K+10][K+10];

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    cin>>n;
    for(int i=1;i<=n;i++){
        cin>>str;
        int len=str.size();
        if(!mp[str]){
            g[len][Int(str[0])][Int(str[len-1])]++;
            mp[str]=1;
        }
        reverse(str.begin(),str.end());
        if(!mp[str]){
            g[len][Int(str[0])][Int(str[len-1])]++;
            mp[str]=1;
        }
    }

    ll ans=0;

    for(int len=1;len<=10;len++){
        for(int i=1;i<=K;i++){
            for(int j=1;j<=K;j++){
                for(int k=1;k<=K;k++){
                    for(int p=1;p<=K;p++){
                        f[len][i][j][k]=(f[len][i][j][k]+g[len][p][i]*g[len][p][j]%Mod*g[len][p][k]%Mod)%Mod;                        
                    }
                }
            }
        }

        for(int i=1;i<=K;i++){
            for(int j=i;j<=K;j++){
                for(int k=j;k<=K;k++){
                    for(int p=k;p<=K;p++){
                        ll C=24;
                        if(i==j || j==k || k==p){
                            C=12;
                        }
                        if(i==j && k==p){
                            C=6;
                        }
                        if(i==k || j==p){
                            C=4;
                        }
                        if(i==p){
                            C=1;
                        }
                        ans=(ans+C*f[len][i][j][k]%Mod*f[len][i][j][p]%Mod*f[len][i][k][p]%Mod*f[len][j][k][p]%Mod)%Mod;
                    }
                }
            }
        }
    }

    cout<<ans;

    the_end
}
```
:::

> 分成多种重复结构分别处理可能比单独求解更优。

## [P7985](https://www.luogu.com.cn/problem/P7985)

:::info[简化题面]
给出两种牛，每种牛为 $\{\text{H},\text{G}\}$ 中的一种，每头牛有重量 $w_i$ 和坐标 $x_i$，你可以匹配两头牛，要求他们的种类不同且坐标差小于等于 $K$。现在求极大匹配下的重量最大值或最小值。
:::

对于最小值的情况，可以把所有的重量取反变成求最大值。

现在考虑最大值的情况，最直接的做法就是设 $f_{i,j,k}$ 为处理了前 $i$ 头 $\text{H}$ 型和处理了前 $j$ 头 $\text{G}$ 型奶牛，最近的失配奶牛是第 $k$ 头奶牛时的失配最大值。

这样的话转移方程是很好表示的，这里不详细展开。

但是这样时空都是 $\mathcal{O}(n^3)$ 的，我们需要优化掉一维。考虑优化第 $3$ 维，重新设一个状态为 $f_{i,j,0/1}$ 表示处理了前 $i$ 头 $\text{H}$ 型和处理了前 $j$ 头 $\text{G}$ 型奶牛，最近失配的种类是 $\text{H}/\text{G}$ 的奶牛时的失配最大值。

现在考虑转移方程，先考虑不改变失配的种类的情况。

如果第 $i+1$ 头 $\text{H}$ 牛和第 $j+1$ 头 $\text{G}$ 牛可以匹配，那么 $f_{i,j,0/1}$ 可以转移到 $f_{i+1,j+1,0/1}$。

假设让第 $i+1$ 头 $\text{H}$ 牛失配，那么可以让 $f_{i+1,j,0}=f_{i,j,0}+w_i$，$\text{G}$ 同理。

不改变失配种类的情况考虑完了，现在考虑改变的情况。

设 $g_i$ 表示与在第 $i$ 头 $\text{H}$ 牛的坐标之后第一个可以和它失配的 $\text{G}$ 牛，$h_i$ 同理，设 $flag_{i,j}$ 表示 $[i,lenh]$ 中的 $\text{H}$ 牛和 $[j,leng]$ 中的 $\text{G}$ 牛的最大匹配数，发现这些都可以在 $\mathcal{O}(n^2)$ 的时间内处理。

设 $x=g_i-j-1$，即 $j$ 与第一只能和 $i$ 失配的 $\text{G}$ 牛的距离，我们希望 $i$ 与 $g_i$ 失配，那么他们之间的牛必须匹配成功，即 $flag_{i+1,j+1} \ge x$。

同时要对 $x$ 和 $0$ 取一个最大值，因为可能 $i$ 和 $j$ 就可以失配。

此时这 $x$ 只牛的状态已经确定，转移方程为 $f_{i+x,j+x,1}=f_{i,j,0}$，另一种情况对称。

注意到每次增加失配重量都是在不改变状态时增加，所以改变状态时不需要添加重量，并且要先算改变的情况以防止 $x=0$ 的情况。

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=5000;

struct Node{
    int x,val;
};

int n,K,lena,lenb;
int nexb[N+10],nexa[N+10],g[N+10][N+10];
int f[N+10][N+10][2];
Node a[N+10],b[N+10];

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    int _;
    cin>>_>>n>>K;
    for(int i=1;i<=n;i++){
        char opt;
        int x,val;
        cin>>opt>>x>>val;
        if(opt=='H'){
            a[++lena]={x,val};
        }
        if(opt=='G'){
            b[++lenb]={x,val};
        }
    }

    if(_==1){
        for(int i=1;i<=lena;i++){
            a[i].val=-a[i].val;
        }
        for(int i=1;i<=lenb;i++){
            b[i].val=-b[i].val;
        }
    }
    
    for(int i=1,j=1;i<=lena;i++){
        while(j<=lenb && (abs(a[i].x-b[j].x)<=K || b[j].x<a[i].x)){
            j++;
        }
        nexb[i]=j;
    }

    for(int i=1,j=1;i<=lenb;i++){
        while(j<=lena && (abs(b[i].x-a[j].x)<=K || a[j].x<b[i].x)){
            j++;
        }
        nexa[i]=j;
    }

    nexa[0]=nexb[0]=1;
    for(int i=lena;i>=1;i--){
        for(int j=lenb;j>=1;j--){
            if(abs(a[i].x-b[j].x)<=K){
                g[i][j]=g[i+1][j+1]+1;
            }
        }
    }

    //0H1G
    for(int i=0;i<=lena;i++){
        for(int j=0;j<=lenb;j++){
            f[i][j][0]=f[i][j][1]=-1e9;
        }
    }

    f[0][0][0]=f[0][0][1]=0;

    for(int i=0;i<=lena;i++){
        for(int j=0;j<=lenb;j++){
            //diff
            int x=0;
            x=max(0,nexb[i]-j-1);
            if(i+x<=lena && g[i+1][j+1]>=x){
                f[i+x][j+x][1]=max(f[i][j][0],f[i+x][j+x][1]);
            }
            x=max(0,nexa[j]-i-1);
            if(j+x<=lenb && g[i+1][j+1]>=x){
                f[i+x][j+x][0]=max(f[i][j][1],f[i+x][j+x][0]);
            }
            //same
            if(j<lenb){
                f[i][j+1][1]=max(f[i][j][1]+b[j+1].val,f[i][j+1][1]);
            }
            if(i<lena){
                f[i+1][j][0]=max(f[i][j][0]+a[i+1].val,f[i+1][j][0]);
            }
            if(j<lenb && i<lena && abs(a[i+1].x-b[j+1].x)<=K){
                f[i+1][j+1][0]=max(f[i+1][j+1][0],f[i][j][0]);
                f[i+1][j+1][1]=max(f[i+1][j+1][1],f[i][j][1]);
            }
        }
    }

    ll ans=max(f[lena][lenb][1],f[lena][lenb][0]);
    if(_==1) ans=-ans;
    cout<<ans;

    the_end
}
```
:::

## [CF1768F](https://www.luogu.com.cn/problem/CF1768F)

:::info[简化题面]

给定整数 $n$ 和长度为 $n$ 的序列 $a$。

从位置 $i$ 跳到位置 $j(1\leq i\leq j\leq n)$ 需要花费 $\min(a_i,a_{i+1},\cdots,a_j)\times(j-i)^2$ 枚金币。

对于 $k=1,2,\cdots,n$，求出从位置 $1$ 经若干次跳跃后跳到位置 $k$ 需要的最小金币总数。
:::

朴素的 dp 很好想，设 $f_i$ 表示从 $1$ 到 $i$ 需要的最小金币数。

转移方程也很简单 $f_i=\min_{1 \le j < i} \{f_j+(j-i)^2\times \min_{k=i}^{j} a_k\}$。

现在要考虑优化，直接优化不太好写，考虑一些性质。

一个比较显然的性质是设 $k$ 是区间 $[i,j]$ 的最小值为 $a_k$，那么 $j\to k\to i$ 一定不劣于 $j \to i$，因为第一种花费的金币为 $a_k(i-k)^2+a_k(k-j)^2=a_k[(i-k)^2+(k-j)^2]$，第二种花的金币数为 $a_k(i-j)^2$，设 $a=i-k,b=k-j$，由基本不等式 $(a+b)^2 \ge a^2+b^2$ 得到。

于是考虑将每一个 $i$ 作为最小值暴力拓展，转移方程和上面一样，当遇到 $a_j \le a_i$ 时停止拓展。

此时似乎还是 $\mathcal{O}(n^2)$ 的，但是这个比较容易优化

有一个性质是对于一个最小值 $a_i$，它的步长 $d \le \frac{n}{a_i}$ 时才有贡献。

因为如果一步一步跳，最劣的情况不劣于 $nd$，而如果一次性把这 $d$ 的距离跳完需要花 $a_i \times d^2$，如果希望有贡献，就要满足 $a_i \times d^2 \le n \times d$，即 $d \le \frac{n}{a_i}$。

有了这个性质，如果 $a_i \ge \sqrt{n}$，那么每次暴力扩展的次数不超过 $\sqrt{n}$ 次。

如果 $a_i < \sqrt{n}$，由于这种数的种类不超过 $\sqrt{n}$，而且遇到同样大小的数会停止拓展，所以这类数中同一个数字最多拓展 $n$ 次，而最多也只有 $\sqrt{n}$ 种不同的，这类情况的拓展不超过 $\mathcal{O}(n\sqrt{n})$ 次。

综合时间复杂度 $\mathcal{O}(n\sqrt{n})$。

:::success[Code]
```cpp line-numbers
#include <bits/stdc++.h>
using namespace std;

#define ll long long 
#define the_end return 0;

const int N=400000;

ll n;
ll a[N+10],f[N+10];

int main(){

    ios::sync_with_stdio(false);
    cin.tie(0),cout.tie(0);

    cin>>n;
    for(int i=1;i<=n;i++){
        cin>>a[i];
        f[i]=1e18;
    }

    f[1]=0;

    for(int i=1;i<=n;i++){
        int d=n/a[i];
        for(int j=i-1;j>=1 && (i-j)<=d;j--){
            f[i]=min(f[i],f[j]+1ll*(i-j)*(i-j)*a[i]);
            if(a[j]<=a[i]) break;
        }
        for(int j=i+1;j<=n && (j-i)<=d;j++){
            f[j]=min(f[j],f[i]+1ll*(j-i)*(j-i)*a[i]);
            if(a[j]<=a[i]) break;
        }
    }

    for(int i=1;i<=n;i++){
        cout<<f[i]<<" ";
    }

    the_end
}
```
:::
