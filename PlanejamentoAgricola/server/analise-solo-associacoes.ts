import type {SoilAssociation} from '../src/lib/analise-solo-associacoes.js';
// Correspondências revisadas com Oracle e mapa do projeto; nomes multivalorados continuam pendentes.
export const SOIL_ASSOCIATIONS:SoilAssociation[]=[
  {
    "source": "BOM SUCESSO 1",
    "status": "partial",
    "location": {
      "fazenda": 42100,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 42100,
        "name": "BOM SUCESSO",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          99
        ]
      }
    ]
  },
  {
    "source": "C. DO GOES",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": []
  },
  {
    "source": "CAROBAS",
    "status": "partial",
    "location": {
      "fazenda": 42400,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 42400,
        "name": "CAROBAS",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          99
        ]
      }
    ]
  },
  {
    "source": "CAXACUMBA 1",
    "status": "partial",
    "location": {
      "fazenda": 40100,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 40100,
        "name": "CAXACUMBA I",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          99
        ]
      }
    ]
  },
  {
    "source": "CAXACUMBA 3",
    "status": "partial",
    "location": {
      "fazenda": 72000,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 72000,
        "name": "CAXACUMBA III",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99
        ]
      }
    ]
  },
  {
    "source": "CHOAN 1",
    "status": "complete",
    "location": {
      "fazenda": 42200,
      "talhao": 1,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 42200,
        "name": "CHOAN",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99,
          101,
          102
        ]
      }
    ]
  },
  {
    "source": "CHOAN 1, 4",
    "status": "partial",
    "location": {
      "fazenda": 42200,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 42200,
        "name": "CHOAN",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99,
          101,
          102
        ]
      }
    ]
  },
  {
    "source": "CHOAN 2",
    "status": "complete",
    "location": {
      "fazenda": 42200,
      "talhao": 2,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 42200,
        "name": "CHOAN",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99,
          101,
          102
        ]
      }
    ]
  },
  {
    "source": "CHOAN 4",
    "status": "complete",
    "location": {
      "fazenda": 42200,
      "talhao": 4,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 42200,
        "name": "CHOAN",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99,
          101,
          102
        ]
      }
    ]
  },
  {
    "source": "CHOAN 5, 6, 7",
    "status": "partial",
    "location": {
      "fazenda": 42200,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 42200,
        "name": "CHOAN",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99,
          101,
          102
        ]
      }
    ]
  },
  {
    "source": "COITE 2 LT 5",
    "status": "complete",
    "location": {
      "fazenda": 73100,
      "talhao": 5,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 73100,
        "name": "COITE 2",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      }
    ]
  },
  {
    "source": "COITE 9 LT 3",
    "status": "complete",
    "location": {
      "fazenda": 72800,
      "talhao": 3,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 72800,
        "name": "COITE 9",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      }
    ]
  },
  {
    "source": "COITE 9 LT 8",
    "status": "complete",
    "location": {
      "fazenda": 72800,
      "talhao": 8,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 72800,
        "name": "COITE 9",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      }
    ]
  },
  {
    "source": "COLTÉ 2, 3",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "COLTÉ corresponde a COITE, mas o nome reúne várias fazendas cadastradas. É necessário definir a fazenda de cada amostra; não duplicar análises nem escolher a primeira fazenda.",
    "candidates": [
      {
        "fazenda": 73100,
        "name": "COITE 2",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      },
      {
        "fazenda": 72700,
        "name": "COITE 3",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      }
    ]
  },
  {
    "source": "COLTÉ 5",
    "status": "partial",
    "location": {
      "fazenda": 73700,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência COLTÉ → COITE aplicada após conferir nome e número no cadastro Oracle. Zona 1 confirmada; talhão obtido por linha do arquivo.",
    "candidates": [
      {
        "fazenda": 73700,
        "name": "COITE 5",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          99
        ]
      }
    ]
  },
  {
    "source": "COLTÉ 7",
    "status": "partial",
    "location": {
      "fazenda": 73200,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência COLTÉ → COITE aplicada após conferir nome e número no cadastro Oracle. Zona 1 confirmada; talhão obtido por linha do arquivo.",
    "candidates": [
      {
        "fazenda": 73200,
        "name": "COITE 7",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          99
        ]
      }
    ]
  },
  {
    "source": "COLTÉ 9, 10, 11, 12",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "COLTÉ corresponde a COITE, mas o nome reúne várias fazendas cadastradas. É necessário definir a fazenda de cada amostra; não duplicar análises nem escolher a primeira fazenda.",
    "candidates": [
      {
        "fazenda": 73300,
        "name": "COITE 10",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      },
      {
        "fazenda": 73800,
        "name": "COITE 11",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      },
      {
        "fazenda": 73000,
        "name": "COITE 12",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99
        ]
      },
      {
        "fazenda": 72800,
        "name": "COITE 9",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      }
    ]
  },
  {
    "source": "CUMBE",
    "status": "partial",
    "location": {
      "fazenda": 72600,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 72600,
        "name": "CUMBE",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          99
        ]
      }
    ]
  },
  {
    "source": "CX CUMBA 12",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": [
      {
        "fazenda": 40100,
        "name": "CAXACUMBA I",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          99
        ]
      },
      {
        "fazenda": 70200,
        "name": "CAXACUMBA II",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          17,
          18,
          99
        ]
      },
      {
        "fazenda": 72000,
        "name": "CAXACUMBA III",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99
        ]
      }
    ]
  },
  {
    "source": "CÚMBE 1",
    "status": "complete",
    "location": {
      "fazenda": 72600,
      "talhao": 1,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 72600,
        "name": "CUMBE",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          99
        ]
      }
    ]
  },
  {
    "source": "ESCURO 1, 7",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": [
      {
        "fazenda": 40300,
        "name": "ESCURO 1",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          99
        ]
      },
      {
        "fazenda": 70400,
        "name": "ESCURO 2",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      }
    ]
  },
  {
    "source": "ESCURO 1-17-19",
    "status": "partial",
    "location": {
      "fazenda": 40300,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "ESCURO 1, código 40300, é o único cadastro da família ESCURO que contém todos os talhões indicados no nome do grupo (1, 17, 19). Zona 1 confirmada no Oracle; o TALHAO de saída segue a regra por linha selecionada.",
    "candidates": [
      {
        "fazenda": 40300,
        "name": "ESCURO 1",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          99
        ]
      }
    ]
  },
  {
    "source": "ESCURO 1.20-21",
    "status": "partial",
    "location": {
      "fazenda": 40300,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "ESCURO 1, código 40300, é o único cadastro da família ESCURO que contém todos os talhões indicados no nome do grupo (1, 20, 21). Zona 1 confirmada no Oracle; o TALHAO de saída segue a regra por linha selecionada.",
    "candidates": [
      {
        "fazenda": 40300,
        "name": "ESCURO 1",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          99
        ]
      }
    ]
  },
  {
    "source": "ESCURO 9, 11, 14",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": [
      {
        "fazenda": 40300,
        "name": "ESCURO 1",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          99
        ]
      },
      {
        "fazenda": 70400,
        "name": "ESCURO 2",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      }
    ]
  },
  {
    "source": "GRAVATA 2",
    "status": "complete",
    "location": {
      "fazenda": 74200,
      "talhao": 2,
      "zona": 3,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 74200,
        "name": "GRAVATÁ - ZONA (C)",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      }
    ]
  },
  {
    "source": "GRAVATA 3",
    "status": "complete",
    "location": {
      "fazenda": 74200,
      "talhao": 3,
      "zona": 3,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 74200,
        "name": "GRAVATÁ - ZONA (C)",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      }
    ]
  },
  {
    "source": "GRAÇA 29",
    "status": "complete",
    "location": {
      "fazenda": 41700,
      "talhao": 29,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 41700,
        "name": "NOSSA SENHORA DAS GRAÇAS",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          61,
          62,
          63,
          64,
          65,
          66,
          67,
          68,
          69,
          99
        ]
      }
    ]
  },
  {
    "source": "GRAÇAS 25",
    "status": "complete",
    "location": {
      "fazenda": 41700,
      "talhao": 25,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 41700,
        "name": "NOSSA SENHORA DAS GRAÇAS",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          61,
          62,
          63,
          64,
          65,
          66,
          67,
          68,
          69,
          99
        ]
      }
    ]
  },
  {
    "source": "GRAÇAS 39, 33",
    "status": "partial",
    "location": {
      "fazenda": 41700,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 41700,
        "name": "NOSSA SENHORA DAS GRAÇAS",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          61,
          62,
          63,
          64,
          65,
          66,
          67,
          68,
          69,
          99
        ]
      }
    ]
  },
  {
    "source": "GRAÇAS 6.11.17",
    "status": "partial",
    "location": {
      "fazenda": 41700,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 41700,
        "name": "NOSSA SENHORA DAS GRAÇAS",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          61,
          62,
          63,
          64,
          65,
          66,
          67,
          68,
          69,
          99
        ]
      }
    ]
  },
  {
    "source": "GRAÇAS INCÊNDIO",
    "status": "partial",
    "location": {
      "fazenda": 41700,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 41700,
        "name": "NOSSA SENHORA DAS GRAÇAS",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          61,
          62,
          63,
          64,
          65,
          66,
          67,
          68,
          69,
          99
        ]
      }
    ]
  },
  {
    "source": "GRAÇAS RENOVAÇÃO",
    "status": "partial",
    "location": {
      "fazenda": 41700,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 41700,
        "name": "NOSSA SENHORA DAS GRAÇAS",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          61,
          62,
          63,
          64,
          65,
          66,
          67,
          68,
          69,
          99
        ]
      }
    ]
  },
  {
    "source": "MARCAÇÃO",
    "status": "partial",
    "location": {
      "fazenda": 73500,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 73500,
        "name": "MARCAÇÃO",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          99
        ]
      }
    ]
  },
  {
    "source": "MUZI",
    "status": "partial",
    "location": {
      "fazenda": 42000,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 42000,
        "name": "FAZENDA MUZI",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19
        ]
      }
    ]
  },
  {
    "source": "NOVA",
    "status": "partial",
    "location": {
      "fazenda": 40500,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 40500,
        "name": "NOVA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      }
    ]
  },
  {
    "source": "P . PARAIBA 8",
    "status": "complete",
    "location": {
      "fazenda": 72500,
      "talhao": 8,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 72500,
        "name": "PAU PARAIBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          99
        ]
      }
    ]
  },
  {
    "source": "P57",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": []
  },
  {
    "source": "PAU PARAIBA 13",
    "status": "complete",
    "location": {
      "fazenda": 72500,
      "talhao": 13,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 72500,
        "name": "PAU PARAIBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          99
        ]
      }
    ]
  },
  {
    "source": "PAU PARAIBA 5-9-10",
    "status": "partial",
    "location": {
      "fazenda": 72500,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 72500,
        "name": "PAU PARAIBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          99
        ]
      }
    ]
  },
  {
    "source": "PAU PARAIBA RENOVAÇAO",
    "status": "partial",
    "location": {
      "fazenda": 72500,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 72500,
        "name": "PAU PARAIBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          99
        ]
      }
    ]
  },
  {
    "source": "PC0 1/2",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": [
      {
        "fazenda": 40700,
        "name": "PECO I",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      },
      {
        "fazenda": 42300,
        "name": "PECO 2",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          99
        ]
      }
    ]
  },
  {
    "source": "PECÓ 3 REN",
    "status": "partial",
    "location": {
      "fazenda": 74100,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 74100,
        "name": "PECÓ - 3",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          99
        ]
      }
    ]
  },
  {
    "source": "PITOMBA",
    "status": "partial",
    "location": {
      "fazenda": 40800,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda 40800 confirmada pelo usuário; zona 1 no Oracle. Informe o talhão específico.",
    "candidates": [
      {
        "fazenda": 40800,
        "name": "PITOMBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          99
        ]
      }
    ]
  },
  {
    "source": "R. ALEGRE",
    "status": "partial",
    "location": {
      "fazenda": 41900,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 41900,
        "name": "RANCHO ALEGRE",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          99,
          105
        ]
      }
    ]
  },
  {
    "source": "RANCHO ALEGRE",
    "status": "partial",
    "location": {
      "fazenda": 41900,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 41900,
        "name": "RANCHO ALEGRE",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          99,
          105
        ]
      }
    ]
  },
  {
    "source": "S MARCOS",
    "status": "partial",
    "location": {
      "fazenda": 73900,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 73900,
        "name": "SÃO MARCOS",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          99
        ]
      }
    ]
  },
  {
    "source": "S. PAULA",
    "status": "partial",
    "location": {
      "fazenda": 41000,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 41000,
        "name": "SANTA PAULA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      }
    ]
  },
  {
    "source": "SANTA ADELIA",
    "status": "partial",
    "location": {
      "fazenda": 41800,
      "talhao": null,
      "zona": 2,
      "estagio": null,
      "producao": null
    },
    "reason": "Mapa do projeto (Fazendas.json) identifica Santa adelia como código 41800; no Oracle esse código é SANTA DÉLIA, zona 2.",
    "candidates": [
      {
        "fazenda": 41800,
        "name": "SANTA DÉLIA",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          99
        ]
      }
    ]
  },
  {
    "source": "SÃO MARCOS",
    "status": "partial",
    "location": {
      "fazenda": 73900,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 73900,
        "name": "SÃO MARCOS",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          99
        ]
      }
    ]
  },
  {
    "source": "SÃO MARCOS 2",
    "status": "complete",
    "location": {
      "fazenda": 73900,
      "talhao": 2,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda pelo nome e talhão numérico único confirmado no cadastro.",
    "candidates": [
      {
        "fazenda": 73900,
        "name": "SÃO MARCOS",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          99
        ]
      }
    ]
  },
  {
    "source": "TABATINGA",
    "status": "partial",
    "location": {
      "fazenda": 41100,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 41100,
        "name": "TABATINGA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          99
        ]
      }
    ]
  },
  {
    "source": "TAVA / S.S",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": [
      {
        "fazenda": 40900,
        "name": "SÃO SEBASTIÃO",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          99
        ]
      },
      {
        "fazenda": 75000,
        "name": "TAUA - ZONA ( A )",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          99
        ]
      }
    ]
  },
  {
    "source": "TH 08",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": 8,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": [
      {
        "fazenda": 42017,
        "name": "BEBEDOURO",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          99
        ]
      },
      {
        "fazenda": 42100,
        "name": "BOM SUCESSO",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          99
        ]
      },
      {
        "fazenda": 42500,
        "name": "BOM SUCESSO 2",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          99
        ]
      },
      {
        "fazenda": 42015,
        "name": "CAMARÃO",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22
        ]
      },
      {
        "fazenda": 42400,
        "name": "CAROBAS",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          99
        ]
      },
      {
        "fazenda": 72000,
        "name": "CAXACUMBA III",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99
        ]
      },
      {
        "fazenda": 42200,
        "name": "CHOAN",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99,
          101,
          102
        ]
      },
      {
        "fazenda": 73300,
        "name": "COITE 10",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      },
      {
        "fazenda": 73800,
        "name": "COITE 11",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      },
      {
        "fazenda": 73000,
        "name": "COITE 12",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          99
        ]
      },
      {
        "fazenda": 73100,
        "name": "COITE 2",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      },
      {
        "fazenda": 72700,
        "name": "COITE 3",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      },
      {
        "fazenda": 73700,
        "name": "COITE 5",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          99
        ]
      },
      {
        "fazenda": 73200,
        "name": "COITE 7",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          99
        ]
      },
      {
        "fazenda": 72800,
        "name": "COITE 9",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      },
      {
        "fazenda": 72600,
        "name": "CUMBE",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          99
        ]
      },
      {
        "fazenda": 40300,
        "name": "ESCURO 1",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          99
        ]
      },
      {
        "fazenda": 70400,
        "name": "ESCURO 2",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      },
      {
        "fazenda": 42000,
        "name": "FAZENDA MUZI",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19
        ]
      },
      {
        "fazenda": 74200,
        "name": "GRAVATÁ - ZONA (C)",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      },
      {
        "fazenda": 42016,
        "name": "IMBIRIBEIRA",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          99
        ]
      },
      {
        "fazenda": 73500,
        "name": "MARCAÇÃO",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          99
        ]
      },
      {
        "fazenda": 41700,
        "name": "NOSSA SENHORA DAS GRAÇAS",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          61,
          62,
          63,
          64,
          65,
          66,
          67,
          68,
          69,
          99
        ]
      },
      {
        "fazenda": 40500,
        "name": "NOVA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      },
      {
        "fazenda": 72500,
        "name": "PAU PARAIBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          99
        ]
      },
      {
        "fazenda": 40700,
        "name": "PECO I",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          99
        ]
      },
      {
        "fazenda": 40800,
        "name": "PITOMBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          99
        ]
      },
      {
        "fazenda": 70800,
        "name": "PITOMBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          99
        ]
      },
      {
        "fazenda": 41900,
        "name": "RANCHO ALEGRE",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          99,
          105
        ]
      },
      {
        "fazenda": 41800,
        "name": "SANTA DÉLIA",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          99
        ]
      },
      {
        "fazenda": 41200,
        "name": "SANTA MÔNICA",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          8,
          10,
          11,
          12,
          13,
          15,
          16,
          17,
          20,
          99
        ]
      },
      {
        "fazenda": 41000,
        "name": "SANTA PAULA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          99
        ]
      },
      {
        "fazenda": 72900,
        "name": "SÃO JOÃO",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          99
        ]
      },
      {
        "fazenda": 40900,
        "name": "SÃO SEBASTIÃO",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          99
        ]
      },
      {
        "fazenda": 75000,
        "name": "TAUA - ZONA ( A )",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          99
        ]
      }
    ]
  },
  {
    "source": "TH 136",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": 136,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": []
  },
  {
    "source": "TH 19",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": 19,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": [
      {
        "fazenda": 42500,
        "name": "BOM SUCESSO 2",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          99
        ]
      },
      {
        "fazenda": 42015,
        "name": "CAMARÃO",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22
        ]
      },
      {
        "fazenda": 42400,
        "name": "CAROBAS",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          99
        ]
      },
      {
        "fazenda": 40300,
        "name": "ESCURO 1",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          99
        ]
      },
      {
        "fazenda": 42000,
        "name": "FAZENDA MUZI",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19
        ]
      },
      {
        "fazenda": 42016,
        "name": "IMBIRIBEIRA",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          99
        ]
      },
      {
        "fazenda": 73500,
        "name": "MARCAÇÃO",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          99
        ]
      },
      {
        "fazenda": 41700,
        "name": "NOSSA SENHORA DAS GRAÇAS",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          61,
          62,
          63,
          64,
          65,
          66,
          67,
          68,
          69,
          99
        ]
      },
      {
        "fazenda": 72500,
        "name": "PAU PARAIBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          99
        ]
      },
      {
        "fazenda": 41900,
        "name": "RANCHO ALEGRE",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          99,
          105
        ]
      },
      {
        "fazenda": 41800,
        "name": "SANTA DÉLIA",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          99
        ]
      }
    ]
  },
  {
    "source": "TH 213",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": 213,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": []
  },
  {
    "source": "TH 25",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": 25,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": [
      {
        "fazenda": 42500,
        "name": "BOM SUCESSO 2",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          99
        ]
      },
      {
        "fazenda": 40300,
        "name": "ESCURO 1",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          99
        ]
      },
      {
        "fazenda": 42016,
        "name": "IMBIRIBEIRA",
        "zonas": [
          3
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          99
        ]
      },
      {
        "fazenda": 41700,
        "name": "NOSSA SENHORA DAS GRAÇAS",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          61,
          62,
          63,
          64,
          65,
          66,
          67,
          68,
          69,
          99
        ]
      },
      {
        "fazenda": 72500,
        "name": "PAU PARAIBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          99
        ]
      },
      {
        "fazenda": 41900,
        "name": "RANCHO ALEGRE",
        "zonas": [
          2
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          39,
          40,
          41,
          42,
          43,
          44,
          45,
          46,
          47,
          48,
          49,
          50,
          51,
          52,
          53,
          54,
          55,
          56,
          57,
          58,
          59,
          60,
          99,
          105
        ]
      }
    ]
  },
  {
    "source": "TH P.P",
    "status": "review",
    "location": {
      "fazenda": null,
      "talhao": null,
      "zona": null,
      "estagio": null,
      "producao": null
    },
    "reason": "Correspondência ambígua ou não localizada; confira as opções.",
    "candidates": [
      {
        "fazenda": 72500,
        "name": "PAU PARAIBA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          5,
          6,
          7,
          8,
          9,
          10,
          11,
          12,
          13,
          14,
          15,
          16,
          17,
          18,
          19,
          20,
          21,
          22,
          23,
          24,
          25,
          26,
          27,
          28,
          29,
          30,
          31,
          32,
          33,
          34,
          35,
          36,
          37,
          38,
          99
        ]
      }
    ]
  },
  {
    "source": "TIBIRIÇA",
    "status": "partial",
    "location": {
      "fazenda": 40200,
      "talhao": null,
      "zona": 1,
      "estagio": null,
      "producao": null
    },
    "reason": "Fazenda identificada pelo nome; zona confirmada no cadastro. O laudo não identifica um talhão único.",
    "candidates": [
      {
        "fazenda": 40200,
        "name": "TIBIRIÇA",
        "zonas": [
          1
        ],
        "talhoes": [
          1,
          2,
          3,
          4,
          99
        ]
      }
    ]
  }
];
export const SOIL_FARM_OPTIONS:SoilAssociation['candidates']=[
  {
    "fazenda": 42017,
    "name": "BEBEDOURO",
    "zonas": [
      3
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      99
    ]
  },
  {
    "fazenda": 42018,
    "name": "BEBEDOURO 2",
    "zonas": [
      4
    ],
    "talhoes": [
      1,
      2,
      3,
      4
    ]
  },
  {
    "fazenda": 42100,
    "name": "BOM SUCESSO",
    "zonas": [
      2
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      99
    ]
  },
  {
    "fazenda": 42500,
    "name": "BOM SUCESSO 2",
    "zonas": [
      2
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      99
    ]
  },
  {
    "fazenda": 42015,
    "name": "CAMARÃO",
    "zonas": [
      3
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22
    ]
  },
  {
    "fazenda": 42400,
    "name": "CAROBAS",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      99
    ]
  },
  {
    "fazenda": 40100,
    "name": "CAXACUMBA I",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      99
    ]
  },
  {
    "fazenda": 70200,
    "name": "CAXACUMBA II",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      17,
      18,
      99
    ]
  },
  {
    "fazenda": 72000,
    "name": "CAXACUMBA III",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      99
    ]
  },
  {
    "fazenda": 42200,
    "name": "CHOAN",
    "zonas": [
      2
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      99,
      101,
      102
    ]
  },
  {
    "fazenda": 73300,
    "name": "COITE 10",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      99
    ]
  },
  {
    "fazenda": 73800,
    "name": "COITE 11",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      99
    ]
  },
  {
    "fazenda": 73000,
    "name": "COITE 12",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      99
    ]
  },
  {
    "fazenda": 73100,
    "name": "COITE 2",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      99
    ]
  },
  {
    "fazenda": 72700,
    "name": "COITE 3",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      99
    ]
  },
  {
    "fazenda": 73700,
    "name": "COITE 5",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      99
    ]
  },
  {
    "fazenda": 73200,
    "name": "COITE 7",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      99
    ]
  },
  {
    "fazenda": 72800,
    "name": "COITE 9",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      99
    ]
  },
  {
    "fazenda": 72600,
    "name": "CUMBE",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      99
    ]
  },
  {
    "fazenda": 40300,
    "name": "ESCURO 1",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      99
    ]
  },
  {
    "fazenda": 70400,
    "name": "ESCURO 2",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      99
    ]
  },
  {
    "fazenda": 74300,
    "name": "FAZENDA MESSIAS",
    "zonas": [
      3
    ],
    "talhoes": [
      1,
      2,
      99
    ]
  },
  {
    "fazenda": 42000,
    "name": "FAZENDA MUZI",
    "zonas": [
      2
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19
    ]
  },
  {
    "fazenda": 74200,
    "name": "GRAVATÁ - ZONA (C)",
    "zonas": [
      3
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      99
    ]
  },
  {
    "fazenda": 42016,
    "name": "IMBIRIBEIRA",
    "zonas": [
      3
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      99
    ]
  },
  {
    "fazenda": 73500,
    "name": "MARCAÇÃO",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      99
    ]
  },
  {
    "fazenda": 41700,
    "name": "NOSSA SENHORA DAS GRAÇAS",
    "zonas": [
      2
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45,
      46,
      47,
      48,
      49,
      50,
      51,
      52,
      53,
      54,
      55,
      56,
      57,
      58,
      59,
      60,
      61,
      62,
      63,
      64,
      65,
      66,
      67,
      68,
      69,
      99
    ]
  },
  {
    "fazenda": 40500,
    "name": "NOVA",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      99
    ]
  },
  {
    "fazenda": 73600,
    "name": "PANGAMONHA 1",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      99
    ]
  },
  {
    "fazenda": 74000,
    "name": "PANGAMONHA 2",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      99
    ]
  },
  {
    "fazenda": 72500,
    "name": "PAU PARAIBA",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      99
    ]
  },
  {
    "fazenda": 74100,
    "name": "PECÓ - 3",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      99
    ]
  },
  {
    "fazenda": 40700,
    "name": "PECO I",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      99
    ]
  },
  {
    "fazenda": 42300,
    "name": "PECO 2",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      99
    ]
  },
  {
    "fazenda": 40800,
    "name": "PITOMBA",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      99
    ]
  },
  {
    "fazenda": 70800,
    "name": "PITOMBA",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      99
    ]
  },
  {
    "fazenda": 41900,
    "name": "RANCHO ALEGRE",
    "zonas": [
      2
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45,
      46,
      47,
      48,
      49,
      50,
      51,
      52,
      53,
      54,
      55,
      56,
      57,
      58,
      59,
      60,
      99,
      105
    ]
  },
  {
    "fazenda": 41800,
    "name": "SANTA DÉLIA",
    "zonas": [
      2
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      99
    ]
  },
  {
    "fazenda": 41200,
    "name": "SANTA MÔNICA",
    "zonas": [
      3
    ],
    "talhoes": [
      1,
      8,
      10,
      11,
      12,
      13,
      15,
      16,
      17,
      20,
      99
    ]
  },
  {
    "fazenda": 41000,
    "name": "SANTA PAULA",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      99
    ]
  },
  {
    "fazenda": 43400,
    "name": "SÃO FRANCISCO",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      99
    ]
  },
  {
    "fazenda": 72900,
    "name": "SÃO JOÃO",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      99
    ]
  },
  {
    "fazenda": 73900,
    "name": "SÃO MARCOS",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      99
    ]
  },
  {
    "fazenda": 40900,
    "name": "SÃO SEBASTIÃO",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      99
    ]
  },
  {
    "fazenda": 41100,
    "name": "TABATINGA",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      99
    ]
  },
  {
    "fazenda": 75000,
    "name": "TAUA - ZONA ( A )",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      99
    ]
  },
  {
    "fazenda": 40200,
    "name": "TIBIRIÇA",
    "zonas": [
      1
    ],
    "talhoes": [
      1,
      2,
      3,
      4,
      99
    ]
  }
];
