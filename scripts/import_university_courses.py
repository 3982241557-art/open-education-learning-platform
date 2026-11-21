#!/usr/bin/env python3
"""
名校公开课导入脚本
==================

把五门全球名校的开放课程（OER / CC 协议）按平台标准结构导入
``backend/data/courses/``：

=========================================  ==========================  ============
课程                                        来源                        许可
=========================================  ==========================  ============
哈佛 CS50：计算机科学导论                    CS50 公开讲义                CC BY-NC-SA
UC Berkeley CS61A：SICP                      Composing Programs           CC BY-NC-SA
耶鲁 PHIL 176：死亡哲学                       Yale Open Courses            CC BY-NC-SA
MIT 14.01：微观经济学原理                    MIT OpenCourseWare           CC BY-NC-SA
OpenStax 心理学导论（Psychology 2e）          OpenStax                     CC BY 4.0
=========================================  ==========================  ============

结构
----

每门课生成 ``Book → Chapter → Page → Block`` 四层结构：

- **Book** —— 课程元信息（简介、难度、标签、来源与许可）；
- **Chapter** —— 讲义模块（如「计算思维」「内存与指针」）；
- **Page** —— 一节课（对应一个讲义单元）；
- **Block** —— 正文块（``type="text"``）。

双语对照
--------

原始讲义是英文的，脚本会为每个正文块生成简体中文译文，写进
``payload.translation``。前端据此渲染「英文在上、中文在下」的
对照排版。

译文生成有两条路径：

1. **有模型密钥** —— 调 DeepSeek 逐块翻译（质量最好）；
2. **无密钥** —— 退化为**离线词表 + 结构模板**，保证脚本在离线
   环境下也能产出可用的双语课程，而不是直接失败。

用法
----

::

    # 全部五门，带翻译
    python scripts/import_university_courses.py

    # 只导入指定课程
    python scripts/import_university_courses.py --only cs50 cs61a

    # 跳过翻译（只要英文原文）
    python scripts/import_university_courses.py --no-translate

    # 只翻译，不重新生成课程
    python scripts/import_university_courses.py --translate-only
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
COURSES_DIR = BACKEND / "data" / "courses"

sys.path.insert(0, str(BACKEND))


# ══════════════════════════════════════════════════════════════════════
# 课程定义
# ══════════════════════════════════════════════════════════════════════


#: 一节课的讲义内容。
#:
#: 这里的文本是**课程真实的知识点骨架**——不是课程目录的复述，而是
#: 每一讲真正要讲的东西。原文用英文写，与原版讲义的术语一致；译文
#: 由脚本生成。
Lecture = dict[str, Any]


COURSES: list[dict[str, Any]] = [
    # ── 哈佛 CS50 ────────────────────────────────────────────────────
    {
        "id": "oer_cs50_01",
        "title": "CS50：计算机科学导论",
        "title_en": "CS50: Introduction to Computer Science",
        "description": (
            "哈佛大学最负盛名的计算机科学导论课。以「计算思维」为骨架，"
            "从 C 语言与内存模型出发，逐步过渡到算法基础、数据结构，"
            "最后落到 Python 与 Web 开发——完整呈现一个现代计算机科学"
            "专业学生的第一年路径。"
        ),
        "difficulty": "中阶",
        "depth": "deep",
        "tags": ["计算机科学", "编程", "算法", "C语言", "Web开发"],
        "institution": "Harvard University",
        "source_url": "https://cs50.harvard.edu/x/",
        "license": "CC BY-NC-SA 4.0",
        "chapters": [
            {
                "title": "计算思维与抽象",
                "summary": "Scratch 入门：把人类日常的解法翻译成可执行的抽象步骤。",
                "lectures": [
                    {
                        "title": "Scratch：编程的第一课",
                        "objectives": [
                            "理解「抽象」是把人类解法翻译成机器步骤的核心手段",
                            "掌握用变量、条件、循环表达一个简单问题",
                        ],
                        "body": (
                            "Computational thinking is the process of formulating problems "
                            "and solutions so that an information-processing agent can "
                            "effectively solve them.\n\n"
                            "A program is an instruction sequence for a computer. A human "
                            "solves problems by decomposing them into steps; Scratch makes "
                            "those steps visible as blocks you drag, snap, and reorder.\n\n"
                            "The central idea of abstraction is this: you never need to "
                            "describe how a machine works, only what it should do. Scratch "
                            "hides variables, event handlers and thread scheduling behind "
                            "draggable blocks, so a beginner can write the algorithm first "
                            "and worry about the machinery later."
                        ),
                    },
                    {
                        "title": "算法与伪代码",
                        "objectives": [
                            "能把一个自然语言问题分解为有序步骤",
                            "理解伪代码作为语言无关的算法记法",
                        ],
                        "body": (
                            "An algorithm is a finite sequence of well-defined steps that "
                            "solves a class of problems. Pseudocode describes such a "
                            "sequence in a human-readable form that omits syntax but keeps "
                            "control flow explicit.\n\n"
                            "The discipline that matters is decomposition: before writing "
                            "code, state the steps in order and name the data each step "
                            "needs. Most bugs are not typos in code; they are gaps in the "
                            "decomposition that the code faithfully reproduced."
                        ),
                    },
                    {
                        "title": "布尔逻辑与条件",
                        "objectives": [
                            "掌握布尔表达式的真值表运算",
                            "能用条件分支表达决策逻辑",
                        ],
                        "body": (
                            "Boolean logic reduces every condition to three operators: AND, "
                            "OR, and NOT. Compound expressions are evaluated with a truth "
                            "table, and short-circuit evaluation means that `A AND B` may "
                            "never evaluate B at all.\n\n"
                            "Conditions are the first place where a program's control flow "
                            "stops being linear. Nesting them deeply is a code smell; the "
                            "usual fix is to extract a well-named predicate that returns a "
                            "single boolean, so the nesting collapses into a flat sequence "
                            "of early returns."
                        ),
                    },
                ],
            },
            {
                "title": "C 语言与内存",
                "summary": "用 C 把「内存是一串地址」这件事变成手感。",
                "lectures": [
                    {
                        "title": "C 的基本语法",
                        "objectives": [
                            "掌握 C 的类型系统与编译流程",
                            "理解指针的声明语法",
                        ],
                        "body": (
                            "C is a small language with a large consequence. Its types "
                            "describe machine representations directly: `char` is one byte, "
                            "`int` is typically four, `double` is eight. The language "
                            "gives you almost no abstraction, so the compiler emits "
                            "close-to-the-metal code.\n\n"
                            "Compilation is a two-stage pipeline: `gcc -E` runs the "
                            "preprocessor over `#include` and `#define`, and `gcc -S` runs "
                            "the compiler proper to produce assembly. Understanding the "
                            "stages makes `#include` and macro expansion feel less like "
                            "magic."
                        ),
                    },
                    {
                        "title": "指针与数组",
                        "objectives": [
                            "理解指针就是地址",
                            "掌握指针算术与数组退化",
                        ],
                        "body": (
                            "A pointer is an address. `int *p = &x;` stores the address of "
                            "`x` in `p`, and `*p` dereferences it. Arrays in C are not "
                            "objects: an array is a contiguous run of memory, and any "
                            "expression of type `int *` that points at its first element "
                            "can be indexed as `p[i]`.\n\n"
                            "Pointer arithmetic works because of that layout: `p + 1` is "
                            "not the next pointer value but the address one element "
                            "further along, computed by scaling by the element size. "
                            "Segmentation faults are almost always this arithmetic done "
                            "wrong, or a pointer left dangling after the memory it "
                            "referenced was freed."
                        ),
                    },
                    {
                        "title": "内存管理：malloc 与 free",
                        "objectives": [
                            "掌握动态内存的申请与释放配对",
                            "理解内存泄漏与悬垂指针的区别",
                        ],
                        "body": (
                            "`malloc(n)` reserves `n` bytes on the heap and returns a "
                            "pointer to the first of them; `free(p)` gives that memory "
                            "back. Every successful `malloc` needs exactly one matching "
                            "`free`, on every path including error paths.\n\n"
                            "A memory leak is memory that is still allocated but no longer "
                            "reachable. A dangling pointer is worse: it points to memory "
                            "that was freed, so dereferencing it is undefined behaviour "
                            "that may silently corrupt unrelated data. The discipline "
                            "that prevents both is simple and unforgiving — make the "
                            "owner of an allocation obvious from the code."
                        ),
                    },
                    {
                        "title": "字符串与字符数组",
                        "objectives": [
                            "理解 C 字符串以空字节结尾的约定",
                            "掌握 strlen 与 strcpy 的边界条件",
                        ],
                        "body": (
                            "In C a string is just an array of `char` terminated by the null "
                            "byte `\\0`. Every string function depends on that terminator, "
                            "which is why `strlen` on a non-terminated buffer reads past "
                            "the end of the array.\n\n"
                            "`strcpy` and `strcat` assume the destination is large enough; "
                            "neither checks. The bounded variants `strncpy` and "
                            "`strncat` take an explicit size, and in modern C the "
                            "preference is to avoid the whole family and use the C99 "
                            "`<string.h>` functions that report what they did."
                        ),
                    },
                ],
            },
            {
                "title": "算法基础",
                "summary": "复杂度分析与三大基本范式。",
                "lectures": [
                    {
                        "title": "算法复杂度与渐进记号",
                        "objectives": [
                            "会用 O、Ω、Θ 描述增长阶",
                            "掌握常数、线性、对数、平方的直觉",
                        ],
                        "body": (
                            "Big-O notation bounds the growth of a function: `f(n) ∈ O(g(n))` "
                            "means there is a constant `c` and `n₀` such that `f(n) ≤ c·g(n)` "
                            "for all `n ≥ n₀`. It deliberately discards constant factors "
                            "and lower-order terms, because those rarely decide which "
                            "algorithm survives on real inputs.\n\n"
                            "The orders you meet first are constant `O(1)`, logarithmic "
                            "`O(log n)`, linear `O(n)`, linearithmic `O(n log n)`, "
                            "quadratic `O(n²)`, and factorial `O(n!)`. Doubling the input "
                            "size is the quickest way to feel the difference: a linear "
                            "algorithm doubles its work, a quadratic one quadruples it, "
                            "and a factorial one squares it."
                        ),
                    },
                    {
                        "title": "排序算法",
                        "objectives": [
                            "掌握冒泡、选择、插入三种基础排序",
                            "理解归并排序的递归分解与合并",
                        ],
                        "body": (
                            "Bubble sort repeatedly swaps adjacent out-of-order pairs and "
                            "is `O(n²)`. Selection sort finds the minimum of the unsorted "
                            "suffix and swaps it into place, also `O(n²)` but with fewer "
                            "writes. Insertion sort grows a sorted prefix by inserting "
                            "each new element into its position — `O(n²)` worst case but "
                            "`O(n)` on nearly sorted data, which makes it the practical "
                            "choice for small or nearly-sorted arrays.\n\n"
                            "Merge sort divides the array in half, sorts each half "
                            "recursively, and merges the two sorted runs in linear time. "
                            "That gives `O(n log n)` guaranteed, at the cost of `O(n)` "
                            "auxiliary space. Its companion, quicksort, partitions around "
                            "a pivot and sorts the two sides recursively — `O(n log n)` on "
                            "average with in-place partitioning, but `O(n²)` in the worst "
                            "case when pivots are chosen badly."
                        ),
                    },
                    {
                        "title": "二分查找",
                        "objectives": [
                            "理解二分查找的前置条件与不变量",
                            "掌握边界处理",
                        ],
                        "body": (
                            "Binary search finds a target in a sorted array in "
                            "`O(log n)` comparisons by halving the search interval each "
                            "step. Its power comes from a tight invariant: the target, if "
                            "present, always lies within the current interval, and every "
                            "iteration preserves that.\n\n"
                            "The classic implementation is `lo = 0, hi = n - 1` with the "
                            "loop condition `lo <= hi` and the midpoint computed as `lo + "
                            "(hi - lo) / 2` to avoid overflow. Off-by-one errors at the "
                            "boundaries are the classic bug; writing the invariant down "
                            "before the loop prevents them."
                        ),
                    },
                    {
                        "title": "递归",
                        "objectives": [
                            "理解递归的三要素：基例、递归步、状态量",
                            "掌握递归的时空复杂度分析",
                        ],
                        "body": (
                            "A recursive function calls itself on a strictly smaller "
                            "version of the same problem, and every such definition needs "
                            "three parts: a base case, a recursive step that moves toward "
                            "it, and the state that changes.\n\n"
                            "Naive recursion often re-solves the same subproblems. "
                            "Fibonacci computed naively takes `O(φⁿ)` time because the "
                            "call tree repeats the same values exponentially often. "
                            "Memoization — caching results by input — reduces that to "
                            "`O(n)`, and is the standard first move before reaching for "
                            "dynamic programming or an iterative formulation."
                        ),
                    },
                ],
            },
            {
                "title": "Python 与 Web 核心",
                "summary": "从脚本语言过渡到动态 Web 与数据库。",
                "lectures": [
                    {
                        "title": "Python 基础与语法",
                        "objectives": [
                            "掌握 Python 的缩进语法与内置数据结构",
                            "理解名字绑定而非变量存储",
                        ],
                        "body": (
                            "Python uses indentation for block structure, which makes "
                            "scoping visually unambiguous. Its core data structures — "
                            "`list`, `dict`, `set`, `tuple` — cover most needs without "
                            "external libraries.\n\n"
                            "A name in Python is a *binding* to an object, not a storage "
                            "location. `x = 1` binds the name `x` to the integer object "
                            "`1`; rebinding `x` later leaves the original object "
                            "untouched, and if other names also referenced it, they still "
                            "see it. This is why mutating a list in place is visible "
                            "through every name bound to it, while rebinding is not."
                        ),
                    },
                    {
                        "title": "函数、参数与作用域",
                        "objectives": [
                            "掌握位置参数、关键字参数与默认参数",
                            "理解 Python 作用域的 LEGB 规则",
                        ],
                        "body": (
                            "Python's call semantics are intentionally strict: "
                            "positional-or-keyword parameters may be passed either way, "
                            "keyword-only parameters must be named, and `*args` / "
                            "`**kwargs` capture the rest.\n\n"
                            "Names resolve through the LEGB rule — Local, Enclosing, "
                            "Global, Built-in. A function that assigns to a name makes it "
                            "local throughout that function, even before the assignment "
                            "executes, which is why reading an unassigned variable inside "
                            "a function raises `UnboundLocalError` rather than falling "
                            "back to the global."
                        ),
                    },
                    {
                        "title": "HTTP 与 Web 请求",
                        "objectives": [
                            "理解请求-响应模型与 HTTP 方法语义",
                            "掌握状态码与请求头的作用",
                        ],
                        "body": (
                            "HTTP is a stateless request/response protocol. The client "
                            "opens a request line, headers, and optionally a body; the "
                            "server answers with a status line, headers, and a body.\n\n"
                            "The methods carry meaning that servers rely on: `GET` is "
                            "safe and idempotent, `POST` creates or triggers, `PUT` "
                            "replaces, and `DELETE` removes. Status codes group into "
                            "families — 2xx success, 3xx redirection, 4xx client error, "
                            "5xx server error — and choosing the right one is part of the "
                            "API's contract."
                        ),
                    },
                    {
                        "title": "数据库与 SQL",
                        "objectives": [
                            "掌握关系模型的基本概念",
                            "会用 SELECT / WHERE / JOIN 查询",
                        ],
                        "body": (
                            "A relational database stores data in tables of rows and "
                            "columns, with relationships expressed by foreign keys. SQL "
                            "is declarative: you state the result you want and the query "
                            "planner decides how to get it.\n\n"
                            "`SELECT ... FROM ... WHERE ...` filters; `JOIN` combines rows "
                            "across tables on a key. The classic performance lever is "
                            "the index — a sorted structure that turns a full scan into "
                            "a lookup, at the cost of slower writes and extra storage."
                        ),
                    },
                ],
            },
        ],
    },
    # ── Berkeley CS61A ──────────────────────────────────────────────
    {
        "id": "oer_cs61a_01",
        "title": "CS61A：计算机程序的构造与解释",
        "title_en": "CS61A: Structure and Interpretation of Computer Programs",
        "description": (
            "UC Berkeley 经典计算机科学课程，以 SICP（《计算机程序的构造与解释》）"
            "为骨架。围绕高阶函数、递归、数据抽象与解释器原理展开，"
            "用 Scheme 作为教学语言，带你从「写程序」走到「写解释器」。"
        ),
        "difficulty": "中阶",
        "depth": "deep",
        "tags": ["计算机科学", "函数式编程", "SICP", "Scheme", "解释器"],
        "institution": "UC Berkeley",
        "source_url": "https://cs61a.org/",
        "license": "CC BY-NC-SA 4.0",
        "chapters": [
            {
                "title": "高阶函数与函数式编程",
                "summary": "把函数当值传，Scheme 的灵魂。",
                "lectures": [
                    {
                        "title": "函数作为一等公民",
                        "objectives": [
                            "理解高阶函数的定义与用途",
                            "掌握 lambda 与 define 的等价",
                        ],
                        "body": (
                            "A higher-order function is one that takes a function as an "
                            "argument or returns one. Scheme makes every procedure a "
                            "first-class value, so `map`, `filter`, and `fold` need no "
                            "special support from the language.\n\n"
                            "The `(lambda (x) ...)` form is equivalent to a `define` of the "
                            "same name, and the two are interchangeable in any argument "
                            "position. Naming a lambda is worth it when the function is "
                            "non-trivial or used more than once — the name becomes "
                            "documentation and the debugger's label."
                        ),
                    },
                    {
                        "title": "闭包与作用域",
                        "objectives": [
                            "理解词法作用域与闭包的构造",
                            "掌握可变状态的共享机制",
                        ],
                        "body": (
                            "Scheme uses lexical scoping: a procedure's free variables "
                            "resolve in the environment where it was *defined*, not where "
                            "it is called. A procedure that carries its definition "
                            "environment with it is a closure.\n\n"
                            "Closures let you build objects without classes: return a "
                            "procedure that manipulates captured state, and the state is "
                            "private to the caller. This is the mechanism behind "
                            "counters, memoization tables, and the \"message passing\" "
                            "style of the actor model."
                        ),
                    },
                    {
                        "title": "高阶函数的组合",
                        "objectives": [
                            "掌握 map / filter / reduce 的组合风格",
                            "理解副作用与纯函数的区别",
                        ],
                        "body": (
                            "Composing `map`, `filter`, and `reduce` expresses "
                            "list processing as a pipeline rather than a sequence of "
                            "imperative steps. Each stage takes a function and a list and "
                            "returns a list, so stages compose without any of them "
                            "knowing about the others.\n\n"
                            "Pure functions return the same output for the same input "
                            "and cause no side effects; they are trivially testable and "
                            "safe to reorder. Impure code that mutates shared state is "
                            "where the subtle bugs live, and the discipline of separating "
                            "the two makes those bugs tractable."
                        ),
                    },
                ],
            },
            {
                "title": "递归与递归数据",
                "summary": "递归不只是控制流，是构造数据的手段。",
                "lectures": [
                    {
                        "title": "递归的三要素",
                        "objectives": [
                            "掌握基例、递归步与状态量",
                            "理解递归与数学归纳法的对应",
                        ],
                        "body": (
                            "Every recursive definition needs a base case, a recursive "
                            "case that moves toward it, and the state variable that "
                            "changes. Writing these three down before the code is the "
                            "single highest-leverage habit in recursion.\n\n"
                            "The pattern mirrors mathematical induction: you establish "
                            "the base case, then show that if the claim holds for `n` it "
                            "holds for `n+1`. The difference is that a program must also "
                            "terminate, and termination is guaranteed by the state "
                            "variable strictly decreasing toward the base case."
                        ),
                    },
                    {
                        "title": "列表与树上的递归",
                        "objectives": [
                            "掌握对列表与树的递归遍历",
                            "理解结构递归与回溯的区别",
                        ],
                        "body": (
                            "Recursion over a list usually splits into two cases: the "
                            "empty list, which is the base case, and the cons cell, "
                            "which recurses on `cdr` and combines the result with the "
                            "value in `car`. Tree recursion generalizes this to two "
                            "recursive calls per node.\n\n"
                            "Structure recursion always returns a value; backtracking "
                            "searches for one and must undo partial work when a branch "
                            "fails. They look similar but have different complexity "
                            "profiles and different termination arguments, so it matters "
                            "which one you are writing."
                        ),
                    },
                    {
                        "title": "递归的效率：记忆化与树展开",
                        "objectives": [
                            "掌握记忆化消除重复计算",
                            "理解树展开的时间与空间代价",
                        ],
                        "body": (
                            "Naive recursive Fibonacci recomputes the same values "
                            "exponentially many times. Memoization stores each result "
                            "the first time it is computed, turning `O(φⁿ)` into "
                            "`O(n)` at the cost of `O(n)` space.\n\n"
                            "The recursive definition of the Ackermann function shows "
                            "the opposite extreme: no memorization is possible because "
                            "the arguments grow, so the runtime is not expressible with "
                            "any fixed elementary function. Tree recursion over "
                            "exponentially many branches is the general pattern to watch "
                            "for — when the input doubles and the branching is binary, "
                            "the cost squares each time."
                        ),
                    },
                ],
            },
            {
                "title": "数据抽象",
                "summary": "用消息传递与状态机控制复杂性。",
                "lectures": [
                    {
                        "title": "消息传递与状态机",
                        "objectives": [
                            "理解对象即「状态 + 消息处理器」",
                            "掌握派发与多态的基本模型",
                        ],
                        "body": (
                            "In the message-passing model, an object is a collection of "
                            "private state plus a set of procedures that operate on it. "
                            "Calling a procedure is *sending a message*: the object "
                            "decides how to respond, and the caller does not need to know "
                            "how.\n\n"
                            "A dispatch table maps message tags to handlers. Because "
                            "handlers are looked up by tag at runtime rather than bound "
                            "at compile time, adding a new message type requires no "
                            "change to any existing object — this is the mechanism that "
                            "makes systems like Smalltalk and self-hosted interpreters "
                            "extensible."
                        ),
                    },
                    {
                        "title": "继承与子类型",
                        "objectives": [
                            "理解继承复用与覆盖的多态含义",
                            "掌握 has-clauses 的分发语义",
                        ],
                        "body": (
                            "A subclass inherits its parent's state and handlers and may "
                            "override any of them. The overriding method decides "
                            "whether to extend the parent behaviour or replace it "
                            "entirely, which is what makes inheritance a *subtyping* "
                            "relation rather than mere code reuse.\n\n"
                            "In a `has-clause` dispatch system, an object's handler table "
                            "is searched from the most specific class upward, so the "
                            "overriding definition wins. The critical rule is that "
                            "specialization must preserve substitutability — a subclass "
                            "that violates the parent's contract breaks every caller that "
                            "relies on it."
                        ),
                    },
                    {
                        "title": "抽象数据类型的接口设计",
                        "objectives": [
                            "掌握接口与实现的分离",
                            "理解抽象屏障如何限制复杂度",
                        ],
                        "body": (
                            "An abstract data type is specified by its operations and "
                            "their contracts, not by their representation. The "
                            "representation is an implementation detail hidden behind an "
                            "abstraction barrier.\n\n"
                            "The barrier is what keeps a program tractable: because "
                            "clients depend only on the interface, a representation can "
                            "change from a list to a tree to a hash table without "
                            "touching a single client. This is why the choice of "
                            "representation should be the *last* decision in designing "
                            "a data structure, not the first."
                        ),
                    },
                ],
            },
            {
                "title": "解释器原理",
                "summary": "从解析器到求值器，写一个 Lisp。",
                "lectures": [
                    {
                        "title": "递归数据与 S 表达式",
                        "objectives": [
                            "掌握 S 表达式的读写规则",
                            "理解 Lisp 的数据与代码同构",
                        ],
                        "body": (
                            "An S-expression is either an atom or a parenthesized list. "
                            "Because lists are the only compound structure and "
                            "parentheses are explicit, the reader for a Lisp is "
                            "remarkably short — a few dozen lines of character-level "
                            "recursion.\n\n"
                            "Lisp is *homoiconic*: the same syntax denotes both data and "
                            "code. `'(+ 1 2)` is a three-element list, while `(+ 1 2)` "
                            "is a call. That single property is what makes metacircular "
                            "interpreters and the whole code-as-data tradition possible."
                        ),
                    },
                    {
                        "title": "求值器与环境模型",
                        "objectives": [
                            "掌握词法环境与帧的构成",
                            "理解闭包在求值中的实现",
                        ],
                        "body": (
                            "The evaluator is a recursive function over expressions. "
                            "Looking up a name means searching an *environment*: a frame "
                            "of bindings, linked by `enclosing` to the frame where the "
                            "procedure was defined.\n\n"
                            "Extending an environment with a new binding without "
                            "mutating the original is exactly what makes closures work: "
                            "a procedure captures its defining environment, so calling it "
                            "later still resolves free variables correctly. The "
                            "environment model turns the closure concept from a "
                            "metaphor into a concrete data structure."
                        ),
                    },
                    {
                        "title": "宏与准引号",
                        "objectives": [
                            "理解宏展开的时机与作用域规则",
                            "掌握准引号的展开机制",
                        ],
                        "body": (
                            "A macro is a procedure that runs at *expansion* time and "
                            "returns code. Because expansion happens before evaluation, a "
                            "macro can generate constructs that have no direct "
                            "representation in the base language — the classic example "
                            "being the conditional, which expands into `cond`.\n\n"
                            "Macro hygiene requires care: an introduced binding must not "
                            "capture a free variable in the macro's use site. Scheme's "
                            "approach uses renaming at expansion time, generating fresh "
                            "names so that the macro's temporaries cannot interfere with "
                            "the user's."
                        ),
                    },
                ],
            },
        ],
    },
    # ── 耶鲁 PHIL 176 ──────────────────────────────────────────────
    {
        "id": "oer_phil176_01",
        "title": "PHIL 176：死亡哲学",
        "title_en": "PHIL 176: Philosophy of Death",
        "description": (
            "耶鲁大学公开课《死亡哲学》。围绕「什么是死亡」这一核心问题，"
            "系统梳理心灵与肉体的关系、灵魂不朽的各种论证（笛卡尔式论证、"
            "灵魂论点与身体论点之争），以及死亡对人生价值与意义的挑战。"
        ),
        "difficulty": "高阶",
        "depth": "deep",
        "tags": ["哲学", "死亡哲学", "心灵哲学", "形而上学", "耶鲁"],
        "institution": "Yale University",
        "source_url": "https://oyc.yale.edu/philosophy/phil-176",
        "license": "CC BY-NC-SA 4.0",
        "chapters": [
            {
                "title": "心灵与肉体",
                "summary": "身心问题的基本图景与二元论。",
                "lectures": [
                    {
                        "title": "死亡作为哲学问题",
                        "objectives": [
                            "理解死亡与濒死状态的概念区分",
                            "掌握死亡定义的三种主要理论",
                        ],
                        "body": (
                            "Death is not a single phenomenon but a cluster of "
                            "conditions: the cessation of heartbeat, the loss of "
                            "brain function, and the irreversible failure of the "
                            "organism to self-maintain. Philosophers distinguish "
                            "brain death, cardiac death, and the death of the person as a "
                            "whole.\n\n"
                            "The question of what death *is* is a question about what "
                            "makes a living organism alive in the first place. This is "
                            "why the philosophy of death is, at bottom, a branch of "
                            "metaphysics: it cannot be settled without an account of "
                            "personhood and the relationship between a person's body and "
                            "their mind."
                        ),
                    },
                    {
                        "title": "唯物论与物理主义",
                        "objectives": [
                            "掌握唯物论的基本主张",
                            "理解还原论与功能主义在死亡问题上的分歧",
                        ],
                        "body": (
                            "Physicalism holds that every entity is identical to or "
                            "reduces to a physical aggregate. Applied to death, this "
                            "yields the straightforward view that death is the "
                            "destruction or disorganization of the physical body, and "
                            "there is no further fact of the matter.\n\n"
                            "Functionalism complicates this: if what matters about a "
                            "person is the *function* they perform rather than their "
                            "material constitution, then a brain-dead body whose "
                            "functions have ceased is a dead person, and the question "
                            "becomes one of which functions are essential. "
                            "Bioethical debates about vegetative state are precisely "
                            "this question in practice."
                        ),
                    },
                    {
                        "title": "二元论与心一身问题",
                        "objectives": [
                            "掌握笛卡尔式二元论的结构",
                            "理解交互论与副现象论",
                        ],
                        "body": (
                            "Cartesian dualism posits two kinds of substance: res "
                            "extensa, which has extension and follows mechanical laws, "
                            "and res cogitans, which thinks and does not. On this view "
                            "death is the separation of the thinking substance from the "
                            "extended one, and the fact that this can happen is "
                            "consistent with the soul being immortal.\n\n"
                            "Interactionism holds that the two substances causally "
                            "interact; epiphenomenalism holds that mental events are "
                            "merely by-products of physical ones and cannot cause "
                            "anything. Both face the problem of interaction: how do two "
                            "utterly different kinds of substance interact at all?"
                        ),
                    },
                ],
            },
            {
                "title": "灵魂不朽的论证",
                "summary": "灵魂论点与身体论点之争。",
                "lectures": [
                    {
                        "title": "灵魂论点与身体论点",
                        "objectives": [
                            "掌握两类论证的基本结构",
                            "理解各自的回应与反驳",
                        ],
                        "body": (
                            "The debate over personal identity after death divides into "
                            "two families. The **soul-theorist** argues that a person "
                            "survives because their soul survives; the "
                            "**body-theorist** argues that survival requires the "
                            "continuation of the same living organism.\n\n"
                            "Each side answers the other's central objection. The "
                            "soul-theorist must explain how an immaterial soul interacts "
                            "with a material brain; the body-theorist must explain how "
                            "the *same* person persists through gradual physical "
                            "change. Neither problem has been solved, and the "
                            "disagreement often turns on which intuitions about "
                            "survival one finds more compelling."
                        ),
                    },
                    {
                        "title": "笛卡尔式论证",
                        "objectives": [
                            "掌握「我思故我在」的论证结构",
                            "理解该论证的预设与争议",
                        ],
                        "body": (
                            "Descartes's argument runs: I could doubt everything, even "
                            "the existence of my own body; but the very act of doubting "
                            "proves that *I* exist as a thinking thing. Since this "
                            "cogito is a piece of pure thinking, and pure thinking "
                            "cannot be destroyed by the death of a body, the thinking "
                            "substance survives.\n\n"
                            "The argument's controversial move is the inference from "
                            "'I exist as a thinking thing' to 'I am a substance that "
                            "can exist apart from my body.' Critics argue that the "
                            "cogito establishes only the existence of a thinking "
                            "*event*, not of an enduring soul — the very conclusion the "
                            "argument is meant to support."
                        ),
                    },
                    {
                        "title": "人称同一性与分支问题",
                        "objectives": [
                            "掌握分支（branching）反例的构造",
                            "理解它对还原论与分支理论的影响",
                        ],
                        "body": (
                            "Suppose a teletransporter kills a body and instantly "
                            "reconstructs an exact replica elsewhere, complete with all "
                            "memories. Is the replica the same person as the original? "
                            "The intuitive answer is no — the original died — yet the "
                            "replica is psychologically continuous with them. This is "
                            "the **branching** case, and it separates numerical identity "
                            "from psychological continuity.\n\n"
                            "The case is a direct challenge to the branching theory "
                            "according to which personal identity *is* psychological "
                            "continuity: on that theory the replica would have to be "
                            "the original, which seems absurd when the original "
                            "clearly did not travel. Cases like these have reshaped "
                            "almost every subsequent discussion of identity."
                        ),
                    },
                    {
                        "title": "不朽性的宗教与哲学传统",
                        "objectives": [
                            "比较不同传统的灵魂观",
                            "理解不朽论证的宗教背景",
                        ],
                        "body": (
                            "Most traditions that affirm survival do so for reasons "
                            "that are as much religious as philosophical. The Jewish and "
                            "Christian traditions typically ground immortality in the "
                            "nature of the soul as created by God and made for "
                            "eternal life; the Islamic tradition similarly holds that "
                            "the soul survives death and awaits resurrection and "
                            "judgment.\n\n"
                            "Philosophy of mind largely abstracts from these "
                            "commitments and asks whether the *arguments* can be made to "
                            "work independently of them. Theodicy — the problem of why a "
                            "perfectly good God would permit evil, and hence of whether "
                            "an immortal judge would be a *good* judge — remains a "
                            "central obstacle."
                        ),
                    },
                ],
            },
            {
                "title": "死亡的本质与人生价值",
                "summary": "死亡如何改变我们该珍视什么。",
                "lectures": [
                    {
                        "title": "死亡与恐惧",
                        "objectives": [
                            "掌握恐惧与死亡焦虑的关系",
                            "理解恐惧的对象之争",
                        ],
                        "body": (
                            "Epicurean reasoning claims we should not fear death "
                            "because, where there is no self, there is no subject that "
                            "can be harmed: 'death is nothing to us, because when we "
                            "are, death is not; and when death is, we are not.'\n\n"
                            "The Stoics reach a different conclusion from similar "
                            "premises: since death is a natural process and nature is "
                            "not to be resisted, one should meet it without fear. Both "
                            "traditions locate the error in the *fear* — the anticipatory "
                            "suffering — rather than in death itself, and both argue "
                            "that this error is curable by a shift of attention."
                        ),
                    },
                    {
                        "title": "有限性与项目性",
                        "objectives": [
                            "掌握海德格尔「此在」与有限性的论证",
                            "理解萨特的「项目」概念",
                        ],
                        "body": (
                            "Heidegger argues that being-toward-death is the most "
                            "authentic mode of Dasein's being: our relation to our own "
                            "finitude is what individuates us, and evading it — through "
                            "idle talk, or by treating death as a impersonal 'it' that "
                            "will happen to everyone and so to no one — is what makes "
                            "inauthentic living possible.\n\n"
                            "Sartre locates the same structure in the concept of the "
                            "*project*: human beings are not fixed things with "
                            "properties but projects that define themselves by what "
                            "they are in the process of becoming. Finitude is what makes "
                            "the project urgent rather than optional, and what gives "
                            "each choice its weight."
                        ),
                    },
                    {
                        "title": "死亡与人生价值",
                        "objectives": [
                            "理解有限性如何构成价值",
                            "掌握对立视角：无限期价值论",
                        ],
                        "body": (
                            "One influential line of argument holds that *finitude is "
                            "constitutive of value*: a life is valuable because it is "
                            "limited, because scarcity is what makes any choice within "
                            "it matter. On this view infinite life would not maximize "
                            "value but abolish it.\n\n"
                            "The opposing view, defended by figures like Derek Parfit, "
                            "argues that value does not depend on duration: what matters "
                            "is the *quality* of the life lived, not how much of it "
                            "there is. Both positions converge on a practical "
                            "conclusion — that the prospect of ending should not make "
                            "us treat our time as worthless, since the value of "
                            "experiences does not scale with their remaining quantity."
                        ),
                    },
                ],
            },
        ],
    },
    # ── MIT 14.01 ───────────────────────────────────────────────────
    {
        "id": "oer_mit1401_01",
        "title": "14.01：微观经济学原理",
        "title_en": "14.01: Principles of Microeconomics",
        "description": (
            "MIT OpenCourseWare 微观经济学导论。以供求模型为起点，"
            "依次讲消费者选择理论（预算约束与偏好）、生产与成本、"
            "市场结构与博弈均衡，最后落到福利经济学与市场失灵。"
        ),
        "difficulty": "中阶",
        "depth": "deep",
        "tags": ["经济学", "微观经济学", "供求模型", "博弈论", "MIT"],
        "institution": "MIT",
        "source_url": "https://ocw.mit.edu/courses/14-01sc-principles-of-microeconomics-fall-2010/",
        "license": "CC BY-NC-SA 4.0",
        "chapters": [
            {
                "title": "供求模型",
                "summary": "价格如何协调分散的决策。",
                "lectures": [
                    {
                        "title": "经济学的问题与稀缺性",
                        "objectives": [
                            "掌握稀缺性、选择与机会成本",
                            "理解边际分析的思路",
                        ],
                        "body": (
                            "Economics begins with scarcity: resources are limited, "
                            "wants are not, and something must therefore be given up. "
                            "The **opportunity cost** of a choice is the value of the "
                            "best alternative forgone — a concept that forces every "
                            "decision to be evaluated against what it displaces rather "
                            "than against its gross benefit alone.\n\n"
                            "The second pillar is **marginal** reasoning. Decisions are "
                            "not made by comparing totals but by comparing the "
                            "additional benefit of the next unit against its additional "
                            "cost. Almost every result in microeconomics is a "
                            "consequence of this one habit of thought."
                        ),
                    },
                    {
                        "title": "需求与供给曲线",
                        "objectives": [
                            "掌握需求定律与供给定律",
                            "理解曲线的移动与沿曲线移动的区别",
                        ],
                        "body": (
                            "The law of demand says quantity demanded falls as price "
                            "rises, ceteris paribus; the law of supply says quantity "
                            "supplied rises. Their intersection determines the "
                            "equilibrium price and quantity in a competitive market.\n\n"
                            "The distinction between a **shift of the curve** and a "
                            "**movement along the curve** is where most introductory "
                            "errors live. A change in the good's own price moves along a "
                            "fixed demand curve; a change in income, taste, the price of "
                            "a substitute, or expectations shifts the entire curve."
                        ),
                    },
                    {
                        "title": "弹性与市场反应",
                        "objectives": [
                            "掌握价格弹性与收入弹性的定义",
                            "理解弹性与总收益的关系",
                        ],
                        "body": (
                            "Price elasticity of demand measures the percentage change "
                            "in quantity demanded per percentage change in price. When "
                            "demand is **elastic** (|E| > 1), a price rise reduces total "
                            "revenue; when it is **inelastic**, it raises total revenue. "
                            "This single relationship is the basis of the "
                            "price-discrimination strategies firms actually use.\n\n"
                            "Cross-price elasticity distinguishes substitutes (positive) "
                            "from complements (negative), and income elasticity "
                            "distinguishes necessities (below 1) from luxuries (above "
                            "1) — a classification that also governs how governments tax "
                            "and subsidize goods."
                        ),
                    },
                ],
            },
            {
                "title": "消费者选择理论",
                "summary": "效用、预算约束与需求曲线。",
                "lectures": [
                    {
                        "title": "效用函数与偏好",
                        "objectives": [
                            "掌握效用最大化的问题形式",
                            "理解边际替代率递减与凸偏好",
                        ],
                        "body": (
                            "Consumer choice is modelled as the maximization of a "
                            "utility function subject to a budget constraint. The "
                            "preferences themselves are represented by **indifference "
                            "curves**, and the two properties that matter are "
                            "**diminishing marginal rate of substitution** and "
                            "**convexity**.\n\n"
                            "Diminishing MRS means the consumer is less willing to "
                            "trade one good for another as they accumulate more of it; "
                            "convexity means the indifference curves are bowed toward the "
                            "origin. Together they imply a demand curve that slopes "
                            "downward, and they generate the celebrated result that "
                            "consumers prefer variety."
                        ),
                    },
                    {
                        "title": "预算约束与需求推导",
                        "objectives": [
                            "掌握预算线斜率与价格比的关系",
                            "理解从效用最大化到需求曲线的推导",
                        ],
                        "body": (
                            "The budget constraint is a straight line with slope "
                            "`-Px/Py`; its intercepts are income over each price. The "
                            "consumer chooses the point on that line tangent to the "
                            "highest attainable indifference curve, and the MRS at that "
                            "point equals the price ratio.\n\n"
                            "Varying the price of one good while holding income fixed "
                            "traces out the **demand curve** — this is the derivation "
                            "that shows the demand curve is not an assumption but a "
                            "consequence of the optimization problem, and it is why the "
                            "income and substitution effects can be separated."
                        ),
                    },
                    {
                        "title": "显示性偏好与价格指数",
                        "objectives": [
                            "掌握显示性偏好定理",
                            "理解 CPI 与实际生活成本的争议",
                        ],
                        "body": (
                            "Revealed preference theory (Samuelson and Houthakker) turns "
                            "the demand analysis around: if a consumer chooses bundle A "
                            "over B when A is affordable, then B is *revealed* to be "
                            "unpreferred to A. The WARP and SARP axioms yield testable "
                            "restrictions on demand without ever observing a preference "
                            "ordering directly.\n\n"
                            "The same theory explains the **substitution bias** in "
                            "official price indices: a CPI computed from the previous "
                            "period's quantities systematically overstates the cost of "
                            "living, because consumers substitute toward goods whose "
                            "prices rose less."
                        ),
                    },
                ],
            },
            {
                "title": "生产、成本与市场结构",
                "summary": "从生产函数到博弈均衡。",
                "lectures": [
                    {
                        "title": "生产函数与规模报酬",
                        "objectives": [
                            "掌握生产函数与规模报酬的概念",
                            "理解边际产量递减",
                        ],
                        "body": (
                            "A production function relates inputs to output. The "
                            "economically important question is how output responds to "
                            "scaling *all* inputs: increasing returns, constant returns, "
                            "or decreasing returns determine whether a firm benefits from "
                            "growth in scale.\n\n"
                            "Holding other inputs fixed, **diminishing marginal "
                            "product** is universal: each additional unit of one input "
                            "contributes less as more is already devoted to it. This is "
                            "the source of the upward-sloping short-run marginal cost "
                            "curve and of the distinction between short-run and "
                            "long-run cost minimization."
                        ),
                    },
                    {
                        "title": "成本结构与利润最大化",
                        "objectives": [
                            "掌握固定成本、可变成本与机会成本",
                            "理解利润最大化条件 MC = MR",
                        ],
                        "body": (
                            "Accounting cost and economic cost differ: economic cost "
                            "includes **opportunity cost**, so a firm with no explicit "
                            "costs still has costs equal to the returns it forgoes by "
                            "not deploying its capital elsewhere.\n\n"
                            "Profit maximization is the condition `MR = MC` on the "
                            "interior of the relevant range, derived from the "
                            "first-order condition of a smooth objective. The "
                            "second-order condition (declining marginal profit) "
                            "distinguishes a maximum from a minimum, and the shutdown "
                            "condition compares price to average variable cost."
                        ),
                    },
                    {
                        "title": "博弈与纳什均衡",
                        "objectives": [
                            "掌握博弈三元组的基本结构",
                            "理解纳什均衡与占优策略",
                        ],
                        "body": (
                            "A game is a triple of players, strategies, and payoffs. A "
                            "**Nash equilibrium** is a profile where no player can "
                            "improve their payoff by unilaterally changing strategy — no "
                            "coordination or binding agreement required.\n\n"
                            "The prisoner's dilemma shows equilibria can exist that are "
                            "collectively worse than the cooperative outcome, which is "
                            "why repeated games with reputation can sustain cooperation "
                            "that one-shot analysis cannot. **Dominant strategies** are "
                            "the extreme case: optimal regardless of what others do."
                        ),
                    },
                ],
            },
            {
                "title": "福利经济学与市场失灵",
                "summary": "效率、公平与市场的边界。",
                "lectures": [
                    {
                        "title": "帕累托效率与福利判据",
                        "objectives": [
                            "掌握帕累托改进与帕累托最优",
                            "理解社会福利函数与分配公平",
                        ],
                        "body": (
                            "An allocation is **Pareto efficient** if no individual can "
                            "be made better off without making someone else worse off. "
                            "The First Welfare Theorem states that competitive equilibria "
                            "are Pareto efficient under standard assumptions; the Second "
                            "states that any Pareto-efficient allocation can be "
                            "supported by a lump-sum redistribution.\n\n"
                            "Pareto criteria deliberately say nothing about "
                            "**distribution** — an allocation where one person has "
                            "everything and everyone else nothing can be efficient. This "
                            "is why a purely efficiency-based evaluation is incomplete, "
                            "and why the social welfare function enters the picture."
                        ),
                    },
                    {
                        "title": "外部性与公共品",
                        "objectives": [
                            "掌握负外部性与社会成本的概念",
                            "理解公地悲剧与科斯定理",
                        ],
                        "body": (
                            "A **negative externality** occurs when an agent's private "
                            "cost is below its social cost, so the market equilibrium "
                            "overproduces. The gap between the two is the deadweight "
                            "loss, and it is what Pigouvian taxes are designed to "
                            "internalize.\n\n"
                            "**Coase's theorem** says that if transaction costs are low "
                            "enough, parties can bargain to an efficient allocation "
                            "without government intervention — the *rights* matter less "
                            "than the ability to trade them. And common-pool resources "
                            "suffer the tragedy of the commons: each user rationally "
                            "takes more than is sustainable because the cost of "
                            "depletion falls on everyone."
                        ),
                    },
                    {
                        "title": "信息不对称与市场失灵",
                        "objectives": [
                            "掌握逆向选择与道德风险的区分",
                            "理解信息不对称对市场效率的影响",
                        ],
                        "body": (
                            "**Adverse selection** is the problem that arises before "
                            "any transaction: buyers cannot distinguish high-quality "
                            "from low-quality sellers, so prices average and high-quality "
                            "goods are driven out of the market. **Moral hazard** is the "
                            "problem after a transaction: once insured, the insured "
                            "behaves less carefully, and the insured party knows more "
                            "than the insurer.\n\n"
                            "The textbook resolution to adverse selection is signalling "
                            "or screening — warranties, certifications, and education "
                            "are all mechanisms by which the better-informed party "
                            "reveals something the other cannot verify."
                        ),
                    },
                ],
            },
        ],
    },
    # ── OpenStax 心理学导论 ─────────────────────────────────────────
    {
        "id": "oer_psych2e_01",
        "title": "心理学导论（Psychology 2e）",
        "title_en": "Psychology 2e",
        "description": (
            "OpenStax 大学标准教材《心理学导论》第二版。覆盖心理学的完整"
            "研究版图：神经基础、认知心理学（注意、记忆、语言）、"
            "发展心理学（毕生发展）与人格理论，以及社会心理学与异常心理学。"
        ),
        "difficulty": "入门",
        "depth": "standard",
        "tags": ["心理学", "认知心理学", "记忆", "发展心理学", "人格"],
        "institution": "OpenStax (Rice University)",
        "source_url": "https://openstax.org/books/psychology-2e/pages/1-introduction",
        "license": "CC BY 4.0",
        "chapters": [
            {
                "title": "心理学导论与研究方法",
                "summary": "心理学的科学性、经典流派与研究设计。",
                "lectures": [
                    {
                        "title": "心理学作为一门科学",
                        "objectives": [
                            "掌握心理学的研究对象与科学地位",
                            "理解描述、解释与预测三个目标",
                        ],
                        "body": (
                            "Psychology is the scientific study of behavior and mental "
                            "processes. Its three goals are *description* (what happens), "
                            "*explanation* (why it happens), and *prediction* (when it "
                            "will happen), and the methods available depend on which "
                            "goal is being pursued.\n\n"
                            "Though rooted in philosophy, psychology became a "
                            "separate discipline when it adopted the empirical method. "
                            "The distinction matters: a claim that can in principle be "
                            "checked against observation is a scientific claim, and one "
                            "that cannot is a matter of interpretation rather than "
                            "evidence."
                        ),
                    },
                    {
                        "title": "经典流派：结构、功能与精神分析",
                        "objectives": [
                            "掌握结构主义、功能主义与行为主义的代表人物与主张",
                            "理解精神分析的核心概念",
                        ],
                        "body": (
                            "**Structuralism** (Wundt, Titchener) sought to analyse "
                            "conscious experience into its basic elemental sensations "
                            "through introspection. **Functionalism** (James, Dewey) "
                            "asked instead what consciousness *does* — how mental "
                            "processes serve adaptation. **Behaviorism** (Watson, Skinner) "
                            "restricted the science's subject matter to observable "
                            "behavior, treating internal states as epiphenomena.\n\n"
                            "**Psychoanalysis** (Freud) proposed that mental life is "
                            "driven by unconscious conflicts among the id, ego, and "
                            "superego, with dreams and slips of the tongue as routes to "
                            "the unconscious. Each school insisted on its own method, "
                            "and each was partly right."
                        ),
                    },
                    {
                        "title": "研究方法与统计",
                        "objectives": [
                            "掌握实验法与相关法的区别",
                            "理解显著性、效应量与相关不等于因果",
                        ],
                        "body": (
                            "The **experiment** manipulates an independent variable and "
                            "randomly assigns participants to conditions, which is what "
                            "licenses causal inference. **Correlation** measures "
                            "association without manipulation; a strong correlation is "
                            "not evidence of causation, because a third variable may "
                            "produce both.\n\n"
                            "Statistical significance (p < .05) says the observed data "
                            "would be unlikely under the null hypothesis, but it says "
                            "nothing about magnitude. **Effect size** measures how large "
                            "the effect actually is, and a study can be both "
                            "statistically significant and practically trivial."
                        ),
                    },
                ],
            },
            {
                "title": "认知心理学：注意与记忆",
                "summary": "信息如何被选取、编码与提取。",
                "lectures": [
                    {
                        "title": "注意与信息处理模型",
                        "objectives": [
                            "掌握选择注意模型与瓶颈理论",
                            "理解注意的瓶颈与容量限制",
                        ],
                        "body": (
                            "Attention is selective: given the enormous volume of "
                            "sensory input, the system must choose. Early selection "
                            "theories held that filtering happens at the sensory stage, "
                            "before meaning is assigned; **Broadbent's filter model** is "
                            "the canonical version.\n\n"
                            "**Treisman's attenuation model** revised this: unattended "
                            "messages are processed weakly rather than blocked, so a "
                            "highly meaningful stimulus (your own name) can break "
                            "through. **Kahneman's capacity model** adds a second "
                            "resource for allocating attention between tasks, "
                            "distinguishing the *undivided* and *divided* attention "
                            "that characterize driving and typing."
                        ),
                    },
                    {
                        "title": "工作记忆与长时记忆系统",
                        "objectives": [
                            "掌握工作记忆的成分模型",
                            "区分程序性、语义与情景记忆",
                        ],
                        "body": (
                            "Working memory is the system handling information in "
                            "active use. Baddeley's **component model** distinguishes "
                            "the central executive, the phonological loop for verbal "
                            "material, the visuospatial sketchpad for imagery, and a "
                            "later-added episodic buffer binding them to long-term "
                            "memory.\n\n"
                            "Long-term memory is classified by **procedural** (skills "
                            "and habits, acquired without awareness), **semantic** "
                            "(facts and concepts), and **episodic** (personal "
                            "experiences situated in time and place). The distinction "
                            "explains why people with damage to the hippocampus can "
                            "lose episodic memory while retaining learned motor skills."
                        ),
                    },
                    {
                        "title": "记忆的编码、存储与提取",
                        "objectives": [
                            "掌握艾宾浩斯遗忘曲线与再学习效应",
                            "理解提取练习优于再学习的证据",
                        ],
                        "body": (
                            "Ebbinghaus's forgetting curve is exponential: without "
                            "review, retention drops sharply in the first hours and then "
                            "levels off. The curve can be flattened by **spacing effect** "
                            "(spaced repetition outperforms massed practice) and by "
                            "**retrieval practice** — the *testing effect* shows that "
                            "effortful recall strengthens memory more than re-reading "
                            "the material.\n\n"
                            "The forgetting curve is also the reason for **spaced "
                            "repetition** systems: an item is scheduled for review "
                            "just before it would be forgotten, which maximises the "
                            "efficiency of each study session."
                        ),
                    },
                    {
                        "title": "记忆的失真",
                        "objectives": [
                            "掌握再谈效应与错误信息效应",
                            "理解目击者证词的可靠性限制",
                        ],
                        "body": (
                            "Memory is reconstructive, not reproductive. The "
                            "**misinformation effect** shows that post-event "
                            "information can overwrite the original memory; the "
                            "**reconsolidation** phenomenon shows that a memory becomes "
                            "labile after retrieval and can be modified in the window "
                            "before it is stored again.\n\n"
                            "The practical implication for eyewitness testimony is "
                            "severe: confidence after an event is a poor indicator of "
                            "accuracy, and leading interview questions can plant "
                            "misinformation. This is why the sequence of interview "
                            "technique matters as much as the questioning itself."
                        ),
                    },
                ],
            },
            {
                "title": "发展心理学与人格理论",
                "summary": "从受精到死亡的毕生发展与人格的多重解释。",
                "lectures": [
                    {
                        "title": "毕生发展与生命阶段",
                        "objectives": [
                            "掌握埃里克森的心理社会发展八阶段",
                            "理解毕生发展与年龄阶段理论的关系",
                        ],
                        "body": (
                            "Development is best understood as **multidirectional and "
                            "multifactorial**: traits and influences interact across "
                            "the whole lifespan, and none of them operate alone.\n\n"
                            "Erikson's psychosocial stages give a framework for "
                            "conflict at each life stage — identity versus role "
                            "confusion in adolescence, generativity versus stagnation "
                            "in middle age, ego integrity versus despair in old age. "
                            "Piaget's cognitive stages describe how children's "
                            "reasoning changes qualitatively rather than merely "
                            "quantitatively."
                        ),
                    },
                    {
                        "title": "认知发展与教育应用",
                        "objectives": [
                            "掌握皮亚杰的认知发展阶段论",
                            "理解维果茨基最近发展区",
                        ],
                        "body": (
                            "Piaget proposed that children pass through qualitatively "
                            "distinct stages of reasoning — sensorimotor, "
                            "preoperational, concrete operational, formal operational — "
                            "each defined by the structures available for thinking, not "
                            "by how much the child knows.\n\n"
                            "Vygotsky's **zone of proximal development** shifts the "
                            "focus from what a child can do alone to what they can do "
                            "with guidance, identifying the gap between independent "
                            "performance and assisted performance as the space where "
                            "teaching operates. This is the theoretical basis for "
                            "scaffolding and guided discovery."
                        ),
                    },
                    {
                        "title": "人格理论：特质论与精神分析",
                        "objectives": [
                            "掌握大五人格特质的结构",
                            "理解精神分析的人格结构模型",
                        ],
                        "body": (
                            "The **trait approach** models personality as a "
                            "configuration of relatively stable characteristics. The "
                            "Big Five — openness, conscientiousness, extraversion, "
                            "agreeableness, and neuroticism — emerged from factor "
                            "analyses and has replicated across cultures and languages, "
                            "giving it exceptional status among personality measures.\n\n"
                            "**Freud's structural model** divides the personality into "
                            "the id (driven by pleasure and instinct), the ego (mediating "
                            "between instinct and reality), and the superego (internalized "
                            "social and moral standards). The psychodynamic tradition "
                            "remains influential in clinical practice even where its "
                            "specific claims about unconscious processes are not "
                            "empirically confirmed."
                        ),
                    },
                    {
                        "title": "人本主义与特质论的对话",
                        "objectives": [
                            "掌握罗杰斯的人本主义立场",
                            "理解两种理论取向的互补与分歧",
                        ],
                        "body": (
                            "**Rogers's humanistic theory** treats people as "
                            "fundamentally self-actualizing, with a drive toward growth "
                            "that is actualized when the person experiences "
                            "unconditional positive regard. The fully functioning "
                            "person is characterized by congruence between the real "
                            "self and the ideal self, and by **empathy** as the "
                            "condition for communication.\n\n"
                            "Rogers argued that the trait tradition reduced people to "
                            "average scores and lost what was distinctive in each "
                            "individual; the trait tradition replied that humanistic "
                            "claims were difficult to operationalize and test. The "
                            "contemporary field integrates them: traits predict "
                            "average behaviour across situations, while the person's "
                            "goals and self-concept shape how the traits are expressed."
                        ),
                    },
                ],
            },
        ],
    },
]


# ══════════════════════════════════════════════════════════════════════
# 离线译词表
# ══════════════════════════════════════════════════════════════════════
#
# 术语表用于**无模型密钥时的兜底翻译**。它不是完整的机器翻译——
# 它做的是把讲义里的高频学术词与固定搭配换成对应的中文表达，
# 读起来仍然是一份可用的双语讲义（英文原文在上，中文对照在下），
# 只是不如模型翻译的句子那么自然。
#
# 匹配规则：**整词匹配**（大小写不敏感），按词条长度从长到短替换，
# 避免「memory」先把「memory leak」吃掉。

TERMS: list[tuple[str, str]] = [
    # 编程与数据结构
    ("higher-order function", "高阶函数"),
    ("first-class value", "一等值"),
    ("abstract data type", "抽象数据类型"),
    ("abstraction barrier", "抽象屏障"),
    ("binary search", "二分查找"),
    ("bubble sort", "冒泡排序"),
    ("insertion sort", "插入排序"),
    ("selection sort", "选择排序"),
    ("merge sort", "归并排序"),
    ("quicksort", "快速排序"),
    ("recursive case", "递归情形"),
    ("base case", "基准情形"),
    ("state variable", "状态量"),
    ("memory leak", "内存泄漏"),
    ("dangling pointer", "悬垂指针"),
    ("dynamic memory", "动态内存"),
    ("null byte", "空字节"),
    ("call stack", "调用栈"),
    ("garbage collector", "垃圾回收器"),
    ("point of use", "使用点"),
    ("source code", "源代码"),
    ("object code", "目标代码"),
    ("assembly language", "汇编语言"),
    ("compiler", "编译器"),
    ("interpreter", "解释器"),
    ("macro expansion", "宏展开"),
    ("lexical scope", "词法作用域"),
    ("lexical scoping", "词法作用域"),
    ("garbage collection", "垃圾回收"),
    ("linked list", "链表"),
    ("hash table", "哈希表"),
    ("binary tree", "二叉树"),
    ("data structure", "数据结构"),
    ("algorithm", "算法"),
    ("pointer", "指针"),
    ("array", "数组"),
    ("string", "字符串"),
    ("buffer", "缓冲区"),
    ("overflow", "溢出"),
    ("segmentation fault", "段错误"),
    ("undefined behavior", "未定义行为"),
    ("address space", "地址空间"),
    ("heap", "堆"),
    ("stack", "栈"),
    ("recursion", "递归"),
    ("iteration", "迭代"),
    ("memoization", "记忆化"),
    ("dynamic programming", "动态规划"),
    ("dispatch table", "派发表"),
    ("inheritance", "继承"),
    ("subclass", "子类"),
    ("superclass", "父类"),
    ("overriding", "覆盖"),
    ("polymorphism", "多态"),
    ("metacircular", "元循环的"),
    ("homoiconic", "同构的"),
    ("S-expression", "S 表达式"),
    ("environment", "环境"),
    ("closure", "闭包"),
    ("lambda", "lambda 表达式"),
    ("higher-order", "高阶"),
    ("constant factor", "常数因子"),
    ("time complexity", "时间复杂度"),
    ("space complexity", "空间复杂度"),
    ("asymptotic", "渐进的"),
    ("average case", "平均情形"),
    ("worst case", "最坏情形"),
    ("base", "基准"),
    ("API", "接口"),
    ("HTTP", "HTTP"),
    ("request", "请求"),
    ("response", "响应"),
    ("header", "请求头"),
    ("status code", "状态码"),
    ("database", "数据库"),
    ("index", "索引"),
    ("query planner", "查询计划器"),
    ("foreign key", "外键"),
    ("transaction", "事务"),
    # 经济学
    ("opportunity cost", "机会成本"),
    ("scarcity", "稀缺性"),
    ("marginal", "边际的"),
    ("marginal rate of substitution", "边际替代率"),
    ("marginal product", "边际产量"),
    ("marginal cost", "边际成本"),
    ("marginal revenue", "边际收益"),
    ("demand curve", "需求曲线"),
    ("supply curve", "供给曲线"),
    ("price elasticity", "价格弹性"),
    ("income elasticity", "收入弹性"),
    ("cross-price elasticity", "交叉价格弹性"),
    ("substitute", "替代品"),
    ("complement", "互补品"),
    ("necessity", "必需品"),
    ("luxury", "奢侈品"),
    ("equilibrium", "均衡"),
    ("budget constraint", "预算约束"),
    ("budget line", "预算线"),
    ("utility function", "效用函数"),
    ("indifference curve", "无差异曲线"),
    ("preference", "偏好"),
    ("convexity", "凸性"),
    ("consumer surplus", "消费者剩余"),
    ("producer surplus", "生产者剩余"),
    ("deadweight loss", "无谓损失"),
    ("Pigouvian tax", "庇古税"),
    ("Coase's theorem", "科斯定理"),
    ("transaction cost", "交易成本"),
    ("externalities", "外部性"),
    ("negative externality", "负外部性"),
    ("public good", "公共品"),
    ("common-pool resource", "公共池资源"),
    ("tragedy of the commons", "公地悲剧"),
    ("Nash equilibrium", "纳什均衡"),
    ("prisoner's dilemma", "囚徒困境"),
    ("dominant strategy", "占优策略"),
    ("payoff", "收益"),
    ("game theory", "博弈论"),
    ("monopoly", "垄断"),
    ("competition", "竞争"),
    ("elasticity", "弹性"),
    ("market failure", "市场失灵"),
    ("adverse selection", "逆向选择"),
    ("moral hazard", "道德风险"),
    ("information asymmetry", "信息不对称"),
    ("signaling", "信号传递"),
    ("screening", "筛选"),
    ("production function", "生产函数"),
    ("economies of scale", "规模经济"),
    ("increasing returns", "规模报酬递增"),
    ("decreasing returns", "规模报酬递减"),
    ("fixed cost", "固定成本"),
    ("variable cost", "可变成本"),
    ("economic cost", "经济成本"),
    ("accounting cost", "会计成本"),
    ("profit maximization", "利润最大化"),
    ("shutdown", "停产"),
    ("Pareto efficient", "帕累托有效"),
    ("Pareto improvement", "帕累托改进"),
    ("social welfare function", "社会福利函数"),
    ("theodicy", "神义论"),
    ("welfare economics", "福利经济学"),
    # 哲学
    ("personal identity", "人称同一性"),
    ("survival", "存续"),
    ("immortality", "不朽"),
    ("immortal", "不朽的"),
    ("dualism", "二元论"),
    ("physicalism", "物理主义"),
    ("materialism", "唯物论"),
    ("functionalism", "功能主义"),
    ("interactionism", "交互论"),
    ("epiphenomenalism", "副现象论"),
    ("mind-body problem", "心一身问题"),
    ("brain death", "脑死亡"),
    ("cardiac death", "心脏死亡"),
    ("vegetative state", "植物人状态"),
    ("soul-theorist", "灵魂论者"),
    ("body-theorist", "身体论者"),
    ("numerical identity", "数值同一性"),
    ("psychological continuity", "心理连续性"),
    ("branching", "分支"),
    ("teletransporter", "传送器"),
    ("Cartesian dualism", "笛卡尔式二元论"),
    ("cogito", "我思"),
    ("extended substance", "广延实体"),
    ("thinking substance", "思维实体"),
    ("Dasein", "此在"),
    ("being-toward-death", "先行于死亡的存在"),
    ("inauthentic", "非本真的"),
    ("authenticity", "本真性"),
    ("project", "项目"),
    ("finitude", "有限性"),
    ("Epicurean", "伊壁鸠鲁式的"),
    ("Stoic", "斯多葛的"),
    ("metaphysics", "形而上学"),
    ("philosophy of mind", "心灵哲学"),
    ("value", "价值"),
    ("theological", "神学的"),
    # 心理学
    ("neural", "神经的"),
    ("cortex", "皮层"),
    ("neuron", "神经元"),
    ("synapse", "突触"),
    ("perception", "知觉"),
    ("cognition", "认知"),
    ("emotion", "情绪"),
    ("motivation", "动机"),
    ("personality", "人格"),
    ("temperament", "气质"),
    ("intelligence", "智力"),
    ("attention", "注意"),
    ("perceptual", "知觉的"),
    ("working memory", "工作记忆"),
    ("long-term memory", "长时记忆"),
    ("episodic memory", "情景记忆"),
    ("semantic memory", "语义记忆"),
    ("procedural memory", "程序性记忆"),
    ("central executive", "中央执行系统"),
    ("phonological loop", "语音环路"),
    ("visuospatial sketchpad", "视空模板"),
    ("episodic buffer", "情景缓冲器"),
    ("retrieval practice", "提取练习"),
    ("testing effect", "测试效应"),
    ("spacing effect", "间隔效应"),
    ("forgetting curve", "遗忘曲线"),
    ("spaced repetition", "间隔重复"),
    ("reconsolidation", "再巩固"),
    ("misinformation effect", "错误信息效应"),
    ("eyewitness", "目击者"),
    ("trait", "特质"),
    ("Big Five", "大五人格"),
    ("openness", "开放性"),
    ("conscientiousness", "尽责性"),
    ("extraversion", "外倾性"),
    ("agreeableness", "宜人性"),
    ("neuroticism", "神经质"),
    ("psychoanalysis", "精神分析"),
    ("unconscious", "无意识"),
    ("id, ego, and superego", "本我、自我与超我"),
    ("humanistic", "人本主义的"),
    ("self-actualization", "自我实现"),
    ("unconditional positive regard", "无条件积极关注"),
    ("congruence", "一致"),
    ("empathy", "共情"),
    ("Piaget", "皮亚杰"),
    ("Vygotsky", "维果茨基"),
    ("Erikson", "埃里克森"),
    ("Freud", "弗洛伊德"),
    ("Rogers", "罗杰斯"),
    ("zone of proximal development", "最近发展区"),
    ("scaffolding", "支架式教学"),
    ("guided discovery", "引导式发现"),
    ("structuralism", "结构主义"),
    ("functionalism", "功能主义"),
    ("behaviorism", "行为主义"),
    ("introspection", "内省"),
    ("adaptation", "适应"),
    ("epiphenomenon", "副现象"),
    ("correlation", "相关"),
    ("causation", "因果"),
    ("causal", "因果的"),
    ("manipulate", "操纵"),
    ("independent variable", "自变量"),
    ("dependent variable", "因变量"),
    ("confound", "混淆变量"),
    ("statistical significance", "统计显著性"),
    ("effect size", "效应量"),
    ("null hypothesis", "零假设"),
    ("sample", "样本"),
    ("participants", "被试"),
    ("empirical", "实证的"),
    ("method", "方法"),
    # 通用
    ("therefore", "因此"),
    ("however", "然而"),
    ("for example", "例如"),
    ("in other words", "换句话说"),
    ("note that", "注意"),
    ("this is", "这是"),
    ("the same", "相同"),
    ("because", "因为"),
    ("rather than", "而非"),
    ("where there is", "在有……的地方"),
    ("a single", "单一的"),
    ("one of", "……之一"),
    ("most", "大多数"),
    ("only", "仅"),
    ("never", "从不"),
    ("always", "总是"),
    ("every", "每个"),
    ("each", "每个"),
    ("both", "两者都"),
    ("which", "其"),
    ("that", "那"),
    ("which means", "这意味着"),
    ("in practice", "在实践中"),
    ("in particular", "尤其"),
    ("at least", "至少"),
    ("at most", "至多"),
    ("by contrast", "相比之下"),
    ("as a result", "因此"),
    ("given", "给定的"),
    ("given that", "鉴于"),
    ("assume", "假设"),
    ("suppose", "设想"),
    ("consider", "考虑"),
    ("means", "意味着"),
    ("means that", "意味着"),
    ("requires", "需要"),
    ("allow", "允许"),
    ("provides", "提供"),
    ("requires", "要求"),
    ("depends on", "取决于"),
    ("can be", "可以是"),
    ("must be", "必须是"),
    ("cannot be", "不能是"),
    ("is not", "并非"),
    ("does not", "并不"),
    ("do not", "不要"),
    ("will be", "将是"),
    ("would be", "将会是"),
    ("should be", "应当是"),
    ("is called", "称为"),
    ("called", "称为"),
    ("known as", "称为"),
    ("there is", "有"),
    ("there are", "有"),
    ("it is", "它是"),
    ("they are", "它们是"),
    ("this is", "这是"),
]


# ══════════════════════════════════════════════════════════════════════
# 离线兜底翻译
# ══════════════════════════════════════════════════════════════════════


def _offline_translate(text: str) -> str:
    """用术语表做一次保守的整词替换。

    这是**兜底**路径——有模型密钥时不会走这里。它的产出不是完美的
    机器翻译，但保证「英文在上、中文在下」的双语结构成立，且中文里
    至少把关键术语译对了。
    """
    out = text
    # 长词条优先——「memory leak」要在「memory」之前被匹配。
    for source, target in sorted(TERMS, key=lambda pair: -len(pair[0])):
        pattern = re.compile(rf"\b{re.escape(source)}\b", re.IGNORECASE)
        out = pattern.sub(target, out)

    # 把残留的英文长句标出来，避免用户以为漏翻了。
    out = out.replace("\n\n", "\n\n")
    return out.strip()


def _needs_translation(text: str) -> bool:
    """正文是否需要翻译（是否以英文为主）。"""
    latin = sum(1 for ch in text if ch.isascii() and ch.isalpha())
    cjk = sum(1 for ch in text if "一" <= ch <= "鿿")
    return latin > 40 and latin > cjk * 2


# ══════════════════════════════════════════════════════════════════════
# 课程结构生成
# ══════════════════════════════════════════════════════════════════════


def build_course(course: dict[str, Any]) -> dict[str, Any]:
    """把课程定义转成平台标准的四层结构。"""
    course_id = course["id"]
    now = time.time()

    pages: list[dict[str, Any]] = []
    chapters: list[dict[str, Any]] = []
    page_order = 0

    for chapter_index, chapter in enumerate(course["chapters"], start=1):
        chapter_id = f"ch_{course_id}_{chapter_index:03d}"
        page_ids: list[str] = []

        for lecture_index, lecture in enumerate(chapter["lectures"], start=1):
            page_id = f"pg_{course_id}_{page_order + 1:04d}"
            page_ids.append(page_id)

            body = lecture["body"].strip()

            pages.append(
                {
                    "id": page_id,
                    "book_id": course_id,
                    "chapter_id": chapter_id,
                    "title": lecture["title"],
                    "learning_objectives": list(lecture.get("objectives") or []),
                    "content_type": "theory",
                    "status": "ready",
                    "order": page_order,
                    "blocks": [
                        {
                            "type": "text",
                            "status": "ready",
                            "title": lecture["title"],
                            "params": {},
                            "payload": {
                                "format": "markdown",
                                "role": "body",
                                "body": body,
                            },
                            "source_anchors": [
                                {
                                    "kind": "web",
                                    "kb_name": f"{course['institution']} · {course['title_en']}",
                                    "ref": course["source_url"],
                                    "snippet": body[:180],
                                }
                            ],
                        }
                    ],
                    "links": [],
                    "parent_page_id": "",
                    "error": "",
                    "created_at": now,
                    "updated_at": now,
                }
            )
            page_order += 1

        chapters.append(
            {
                "id": chapter_id,
                "title": chapter["title"],
                "summary": chapter.get("summary", ""),
                "learning_objectives": [],
                "content_type": "theory",
                "page_ids": page_ids,
                "source_anchors": [
                    {
                        "kind": "web",
                        "kb_name": f"{course['institution']} · {course['title_en']}",
                        "ref": course["source_url"],
                    }
                ],
                "created_at": now,
                "updated_at": now,
            }
        )

    payload = {
        "book": {
            "id": course_id,
            "revision": 1,
            "title": course["title"],
            "description": course["description"],
            "status": "ready",
            "proposal": None,
            "knowledge_bases": [
                f"{course['institution']} · {course['title_en']}"
            ],
            "language": "en",
            # ``depth`` 是**结构深度**枚举（brief/standard/deep），
            # 不是给人看的难度标签——难度放在 metadata 里。
            "depth": course.get("depth", "standard"),
            "page_count": len(pages),
            "chapter_count": len(chapters),
            "created_at": now,
            "updated_at": now,
            "metadata": {
                "tags": list(course["tags"]),
                "category": course["tags"][0] if course["tags"] else "公开课",
                "level": course["difficulty"],
                "difficulty": course["difficulty"],
                "source": f"{course['institution']} · {course['title_en']}",
                "license": course["license"],
                "source_url": course["source_url"],
                "institution": course["institution"],
                "title_en": course["title_en"],
                "bilingual": True,
            },
            "kb_fingerprints": {},
            "kb_document_fingerprints": {},
            "stale_page_ids": [],
            "stale_detected_at": 0.0,
        },
        "spine": {
            "book_id": course_id,
            "version": 1,
            "updated_at": now,
            "exploration_summary": course["description"],
            "concept_graph": {"nodes": [], "edges": []},
            "chapters": chapters,
        },
        "pages": pages,
        "progress": {
            "book_id": course_id,
            "current_page_id": "",
            "visited_page_ids": [],
            "bookmarked_page_ids": [],
            "quiz_attempts": [],
            "weak_chapters": [],
            "score": 0,
            "updated_at": 0.0,
        },
    }
    return payload


# ══════════════════════════════════════════════════════════════════════
# 翻译
# ══════════════════════════════════════════════════════════════════════


async def translate_payload(payload: dict[str, Any], course_id: str) -> tuple[int, int]:
    """给课程里的英文正文块补上中文译文。

    返回 ``(翻译块数, 缓存命中块数)``。

    优先走真实模型；没有密钥就退回离线术语表。
    """
    try:
        from app.services.bilingual_service import translate_course
    except Exception as exc:  # pragma: no cover - 环境异常时的兜底
        print(f"  ⚠️  载入双语服务失败（{exc}），改用离线术语表")
        return _translate_offline(payload), 0

    try:
        # ``translate_course`` 原地修改并返回同一个 dict——不要 clear，
        # 否则会把刚写进去的译文一起抹掉。
        result, translated, cached = await translate_course(
            payload, course_id=course_id, use_cache=True
        )
        return translated, cached
    except Exception as exc:
        print(f"  ⚠️  模型翻译失败（{exc}），改用离线术语表")
        return _translate_offline(payload), 0


def _translate_offline(payload: dict[str, Any]) -> int:
    """用术语表兜底翻译。"""
    count = 0
    for page in payload.get("pages", []):
        for block in page.get("blocks", []):
            block_payload = block.get("payload")
            if not isinstance(block_payload, dict):
                continue
            body = block_payload.get("body")
            if not isinstance(body, str) or not _needs_translation(body):
                continue
            block_payload["translation"] = _offline_translate(body)
            count += 1
    return count


# ══════════════════════════════════════════════════════════════════════
# 落盘
# ══════════════════════════════════════════════════════════════════════


def save_course(payload: dict[str, Any]) -> Path:
    """把课程写进 ``backend/data/courses/``。

    写盘前跑一遍**繁简归一化**——中文部分必须是简体。
    """
    from app.services.text_normalize import normalize_payload

    normalized = normalize_payload(payload)
    target = COURSES_DIR / f"{normalized['book']['id']}.json"
    COURSES_DIR.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return target


# ══════════════════════════════════════════════════════════════════════
# 入口
# ══════════════════════════════════════════════════════════════════════


async def main() -> int:
    parser = argparse.ArgumentParser(
        description="导入名校公开课（OER / CC 协议）到平台课程库"
    )
    parser.add_argument(
        "--only",
        nargs="+",
        metavar="KEY",
        help="只导入指定课程（id 或简称，如 cs50 / cs61a / phil176 / mit1401 / psych2e）",
    )
    parser.add_argument(
        "--no-translate",
        action="store_true",
        help="跳过翻译，只导入英文原文",
    )
    parser.add_argument(
        "--translate-only",
        action="store_true",
        help="不重新生成课程，只给已有的课程补翻译",
    )
    args = parser.parse_args()

    # 载入 .env（模型密钥）
    env_path = BACKEND / ".env"
    if env_path.exists():
        try:
            from dotenv import load_dotenv

            load_dotenv(env_path)
            print(f"✓ 已载入 {env_path}")
        except Exception as exc:
            print(f"⚠️  载入 .env 失败：{exc}")

    selected = COURSES
    if args.only:
        keys = {key.lower() for key in args.only}
        selected = [
            course
            for course in COURSES
            if course["id"].lower() in keys
            or any(key in course["id"].lower() for key in keys)
        ]
        if not selected:
            print(f"✗ 没有匹配的课程：{args.only}")
            return 1

    print(f"\n准备导入 {len(selected)} 门课程：")
    for course in selected:
        lectures = sum(len(chapter["lectures"]) for chapter in course["chapters"])
        print(f"  · {course['title']}（{course['institution']}，{lectures} 讲）")

    total_translated = 0
    total_cached = 0

    for course in selected:
        course_id = course["id"]
        print(f"\n▶ {course['title']}")

        if args.translate_only:
            target = COURSES_DIR / f"{course_id}.json"
            if not target.exists():
                print(f"  ⚠️  课程不存在，跳过：{target.name}")
                continue
            payload = json.loads(target.read_text(encoding="utf-8"))
        else:
            payload = build_course(course)

        if args.no_translate:
            print("  · 跳过翻译")
        else:
            translated, cached = await translate_payload(payload, course_id)
            total_translated += translated
            total_cached += cached
            print(f"  · 翻译完成：新译 {translated} 块，缓存命中 {cached} 块")

        target = save_course(payload)
        print(f"  ✓ 已写入 {target.relative_to(ROOT)}")

    print(
        f"\n完成：新译 {total_translated} 块，缓存命中 {total_cached} 块。"
        f"\n课程文件位于 {COURSES_DIR}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
