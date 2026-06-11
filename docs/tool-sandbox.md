# 工具沙箱 · 选型、取舍与实施路线

> 范围:Agent 工具层的运行隔离——`shell` 工具及其子进程,以及 fs 工具的读写范围。
> 目标:在**以 Linux 为部署目标**的前提下,用尽量轻的方式做到两件事:
> **限制读写范围**(文件可见性)与**限制可调用指令**,而不引入 Docker 级别的重量。
> 前提:开发环境将**迁移到 Linux**,因此 OS 级隔离(bwrap)可作为正式方案,而非仅纸面预留。
> 状态:选型已采纳(bwrap);实施按阶段推进。日期:2026-06-11。

---

## 1. 背景与需求

当前 `server/src/tools/shell.ts` 把命令字符串直接交给 `/bin/sh -c` 在宿主执行,
唯一防线是 `policy.ts` 的正则 denylist——可被管道、`$()`、编码绕过,等于无隔离。

硬性需求:

- **限制读写范围**:默认只允许一个工作区;工作区之外按策略(不限制 / 仅工作区 / 白名单)控制。
- **限制可调用指令**:只允许白名单内的命令,其余不可用。
- **拦截在沙箱层(OS 级)做**:LLM 照常用自然的 shell 字符串,不在应用层解析命令、不改工具入参。
- **比 Docker 轻**:无镜像、无守护进程、无 root、启动快。

---

## 2. 候选方案对比

| 方案 | 本质 | 限读写范围 | 限可调用指令 | 依赖 / 量级 | 否决/采纳理由 |
|---|---|---|---|---|---|
| **bubblewrap (bwrap)** | namespaces + bind mount 的无特权封装 | ✓✓ bind mount 精确 | ✓ 只 bind 白名单二进制 + 最小 PATH | 单个 setuid 二进制,无守护进程,毫秒级 | **采纳** |
| Landlock | 内核 LSM,进程自我限制 | ✓✓ 路径级读/写/执行 | ✓ 路径执行权限 | 零外部依赖(内核≥5.13),需 N-API 绑定 | 最轻最纯,但 Node 接入成本高、内核版本敏感;留作后续加固 |
| systemd-run | 为每条命令起 transient unit | ✓ ReadWritePaths/ProtectSystem | △ NoExecPaths 间接 | 需 systemd | 声明式清晰,但绑定 systemd、每命令略重 |
| nsjail | namespaces+seccomp+cgroup+rlimit | ✓✓ | ✓ | 一个二进制,配置最繁 | 功能最全但配置复杂,收益不抵成本 |
| firejail | SUID 沙箱 + profile | ✓✓ | △ profile | SUID 二进制 | 历史有 SUID 提权 CVE,安全工具自身是风险点 |
| seccomp-bpf | syscall 白名单 | ✗ | ✗ | 内核 | 只限"做哪些系统调用",不限路径/命令名;是补充层非主方案 |
| Docker / 容器 | 镜像 + 守护进程 + cgroup 全栈 | ✓✓ | ✓ | 重:镜像、daemon、root | 过重;只需要其中"限范围+限指令"两件事 |

---

## 3. 决策:采用 bubblewrap

`bwrap` 通过 **bind mount** 把宿主文件系统投射出一个受限视图,子进程**只能看到显式投射进来的东西**;
配合 namespaces 隔离网络/PID。它正好同时命中两个核心需求:

- **限读写范围** = `--bind <workspace>`(可写)+ `--ro-bind` 系统目录(只读)+ 其余不投射(不可见)。
- **限可调用指令** = 不投射整个 `/usr/bin`,只 `--ro-bind` 白名单二进制 + 设最小 `PATH`,
  未授权命令在沙箱里"文件不存在"→ `command not found`。

代表性调用:

```
bwrap --unshare-all --die-with-parent \
      --proc /proc --dev /dev --tmpfs /tmp \
      --ro-bind /usr/lib /usr/lib --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
      --ro-bind /bin/sh /bin/sh \
      --ro-bind /usr/bin/git /usr/bin/git  --ro-bind /bin/ls /bin/ls  (…白名单逐个) \
      --bind   <workspaceRoot> <workspaceRoot> \
      --chdir  <workspaceRoot> \
      --setenv PATH /usr/bin:/bin --setenv HOME <workspaceRoot> \
      -- /bin/sh -c "<command>"
```

> 系统目录只读、工作区可写、工作区外不可见、默认 `--unshare-all` 断网(需要时再 `--share-net`)。

### 选它而不是其他的理由

- **比 Docker 轻一个数量级**:无镜像构建、无 daemon、无需 root、毫秒级启动,契合"每次工具调用包一层"的用法。
- **bind mount 的心智模型直接对应"读写范围 + 指令白名单"两个需求**,配置即声明。
- **拦截在 OS 层**:满足"LLM 正常用 shell、拦截在沙箱层做"的硬约束,不必在应用层脆弱地解析命令。
- 成熟、被 Flatpak 大规模使用,无守护进程攻击面。

---

## 4. 取舍与代价(为什么接受)

- **依赖宿主存在 `bwrap` 二进制**:Linux 发行版可一行安装(`apt/dnf install bubblewrap`);
  探测不到时降级为直通并告警。相比 Landlock 的"零依赖",这是为换取低接入成本付出的代价。
- **仅 Linux 生效**:迁移到 Linux 前的任何非 Linux 环境用直通后端,此时 shell 的读写范围/指令限制不生效(仅 denylist 兜底)。迁移完成后即成为常态方案。
- **指令白名单靠"逐个 bind 二进制"实现**:需顺带只读投射动态库目录(`/usr/lib`、`/lib`),
  否则白名单命令因缺 `.so` 跑不起来。库整体只读可见无害,命令仍受限。
- **不约束 Node 进程内的 fs 工具**:`file_read/write/edit/glob/grep` 在 server 进程内直接读文件,
  不经子进程,bwrap 管不到——这部分由**应用层路径策略**(同一份工作区+白名单配置)单独约束。
  两层必须共用同一基准,否则出现"校验一处、读写另一处"的漏洞。
- **不做资源限制**:bwrap 本身不管 CPU/内存/进程数;先靠超时 + 输出截断兜底,资源限制留待后续。

---

## 5. 何时该做强隔离(优先级判断)

隔离是**防御性、非功能性**需求——它不增加 agent 能做的事,只在面对真实风险时才有价值。
对照以下信号,**只要都还没发生,OS 级强隔离就可以延后**,不必抢在核心功能之前:

1. agent 是否**对外暴露 / 多用户**?(还是仅本地自用)
2. 是否会执行**不可信来源**的高风险指令?
3. 是否已**长期跑在 Linux 服务器**上?

在核心闭环(工具层、LLM、存储、前端)还在迭代时投入 OS 沙箱,属于过早优化。
沙箱加固更适合放在"功能基本稳定、准备让别人用"的节点集中做。

---

## 6. 实施路线(分阶段)

### 阶段 A — 应用层路径策略(现在做,跨平台、不浪费)

- 默认一个**工作区** + 三档路径策略 `none` / `workspace` / `allowlist`,全局配置开关。
- 约束 fs 工具(`file_read/write/edit/glob/grep`)的 `path` 参数;纯 TS、可单测,任何平台可写可测。
- shell 的指令限制**暂用现有 denylist 兜底**,不纠结其不严格(本地自用风险可控)。
- 关键:这份"工作区根 + 白名单"配置是阶段 B 要**复用的同一基础**,现在做不会白做。

### 阶段 B — bwrap OS 隔离(迁移到 Linux 后做)

- 引入可插拔 `SandboxBackend`:`auto`(Linux 且检测到 bwrap → bwrap,否则直通告警)/ `none` / `bwrap`。
- `shell` 子进程经 bwrap 执行,OS 层强制可见范围 + 指令白名单,复用阶段 A 的工作区+白名单配置。
- 在真实 Linux 环境验证:`cat /etc/passwd` 不可见、白名单外命令 not found、工作区内可读写、默认断网。

### 阶段 C — 加固(对外 / 长期运行时再做)

- Landlock(含 fs 工具进程自限)、seccomp-bpf(挡 `ptrace`/`mount`)、rlimits/cgroups(CPU/内存/进程数防 fork bomb)。
- 可选:把 fs 工具也下放到沙箱子进程,统一由 OS 层约束。

---

## 7. 两层落地形态(概要)

```
应用层 policy(三档路径策略)   ── 约束 fs 工具的 path 参数 ── 跨平台、可单测
        共享「工作区根 + 白名单路径」配置
沙箱层 SandboxBackend(bwrap)   ── 约束 shell 子进程的可见范围 + 可调用指令 ── Linux 生效
```

全局配置项(env,与现有 `config.tools` 风格一致):路径策略档位、工作区根、白名单路径、
沙箱后端、指令白名单、是否联网。详细实现待单独的实现计划。

---

## 8. 参考

- bubblewrap: https://github.com/containers/bubblewrap
- Landlock: https://docs.kernel.org/userspace-api/landlock.html
- systemd sandboxing: `man systemd.exec`(ProtectSystem / ReadWritePaths / SystemCallFilter)
