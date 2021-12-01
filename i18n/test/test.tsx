import React from 'react'

import { I18N } from '../index'

const _dict = {
    "阅读更多": {
        "en": "Read more",
        "ja": "もっとご覧になる",
        "ko": "더 읽어보기"
    },
    "',\",<,>为非法字符,请重新输入!": {
        "en": ", \", <, and > are invalid characters. Please enter again.",
    },
    "书": {
        "ja": "{{count}}冊の本",
        "en": "{{count}} book",
    },
    "书_plural": {
        "en": "{{count}} books",
    },
    "test_key": {
        "en": "Hello <1>{{name}}</1>, you have {{count}} unread message. <5>Go to message</5>.",
        "zh": "你好 <1>{{name}}</1>, you have {{count}} unread message. <5>Go to message</5>.",
    },
    "test_key_plural": {
        "en": "Hello <1>{{name}}</1>, you have {{count}} unread messages.  <5>Go to messages</5>.",
    },
}


const { t, Trans } = new I18N(_dict, 'en')


export function Test () {
    const count = 3
    const name  = 'hongfeishen'
    
    let expireTime, totalPayInfo
    
    t('{{ minute }}分 {{ second }}秒 内完成支付(促销订单时效{{ overdueTotalTime }}分钟)', {
        minute: Math.floor(expireTime / 60),
        second: expireTime % 60,
        overdueTotalTime: totalPayInfo?.overdueTime,
    })
    
    
    t('联系我们')
    t('联系我们', { context: 'button' })
    
    t('找不到的')
    
    const a = {
        bar: name?.length
    }
    
    const bigi = 9007199254740991n
    
    return <div>
        <Trans>温馨提示：<br /><br />1. 巴拉巴拉；<br /><br />2. 巴拉巴拉；</Trans>
        <Trans count={count} tOptions={{  }}>Hello <strong title='this is your name'>{{name}}</strong>, you have {{count}} unread message(s). <a href='/msgs'>Go to messages</a>.</Trans><br/>
        <Trans >联系我们 {{ name }} 测试插值</Trans><br/>
        <Trans tOptions={{ language: 'ko' }}>书</Trans><br/>
        <Trans tOptions={{ context: 'button' }}>书</Trans><br/>
        <Trans tOptions={{ context: 'button', count: 3 }}>书</Trans><br/>
        <Trans count={0}>书</Trans><br/>
        <Trans count={1}>书</Trans><br/>
        <Trans count={2}>书</Trans><br/>
        <Trans>书 {{ testcall: name.bold?.() }} {{ testprop: name?.length }} {{ testindex: name?.[0] }}</Trans><br/>
    </div>
}
