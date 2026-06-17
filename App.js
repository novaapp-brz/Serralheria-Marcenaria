import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, Button, FlatList, TouchableOpacity, Alert, Image, PanResponder, Dimensions, StatusBar, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Line, Circle, Text as SvgText, Rect } from 'react-native-svg';

const Cores = {
  fundo: '#121212',
  card: '#1E1E1E',
  destaque: '#2D9CDB',
  texto: '#FFFFFF',
  textoSec: '#999',
  borda: '#333',
  erro: '#EB5757',
};

const parse = (valor) => {
  const num = parseFloat(String(valor).replace(',', '.'));
  return isNaN(num)? 0 : num;
};

const TARIFAS_ENERGIA = {
  'SP': { nome: 'ENEL SP', tarifa: 0.65 },
  'EDP-SP': { nome: 'EDP São Paulo', tarifa: 0.67 },
  'SP-CPFL': { nome: 'CPFL Paulista', tarifa: 0.68 },
  'RJ': { nome: 'Light', tarifa: 0.72 },
  'MG': { nome: 'CEMIG', tarifa: 0.70 },
  'RS': { nome: 'CEEE', tarifa: 0.69 },
  'PR': { nome: 'COPEL', tarifa: 0.62 },
  'SC': { nome: 'CELESC', tarifa: 0.64 },
  'BA': { nome: 'COELBA', tarifa: 0.71 },
  'PE': { nome: 'CELPE', tarifa: 0.73 },
  'CE': { nome: 'ENEL CE', tarifa: 0.70 },
  'ES': { nome: 'EDP Espírito Santo', tarifa: 0.69 },
  'EDP-ES': { nome: 'EDP Espírito Santo', tarifa: 0.69 },
  'GO': { nome: 'ENEL GO', tarifa: 0.67 },
  'DF': { nome: 'NEOENERGIA', tarifa: 0.66 },
  'PADRAO': { nome: 'Média Brasil', tarifa: 0.68 }
};

// ALGORITMO GUILLOTINE
const calcularNestMisturado = (larguraChapa, alturaChapa, listaPecas, refilo = 5) => {
  const chapas = [];
  let pecasExpandida = [];
  listaPecas.forEach(p => {
    for(let i = 0; i < parse(p.qtd); i++) {
      pecasExpandida.push({
        id: `${p.id}-${i}`,
        largura: parse(p.largura),
        altura: parse(p.altura),
        idxOriginal: listaPecas.indexOf(p)
      });
    }
  });
  pecasExpandida.sort((a, b) => (b.largura * b.altura) - (a.largura * a.altura));

  const criarChapaVazia = () => ({
    espacos: [{ x: 0, y: 0, w: larguraChapa, h: alturaChapa }],
    pecasColocadas: []
  });

  const encaixarPeca = (chapa, peca) => {
    for(let tentativa = 0; tentativa < 2; tentativa++) {
      const rotacionar = tentativa === 1;
      const w = rotacionar? peca.altura + refilo : peca.largura + refilo;
      const h = rotacionar? peca.largura + refilo : peca.altura + refilo;
      for(let i = 0; i < chapa.espacos.length; i++) {
        const espaco = chapa.espacos[i];
        if(w <= espaco.w && h <= espaco.h) {
          chapa.pecasColocadas.push({
           ...peca,
            x: espaco.x,
            y: espaco.y,
            w: w - refilo,
            h: h - refilo,
            rotacionado: rotacionar
          });
          const espacoRestante = [];
          if(espaco.w - w > 0) {
            espacoRestante.push({ x: espaco.x + w, y: espaco.y, w: espaco.w - w, h: h });
          }
          if(espaco.h - h > 0) {
            espacoRestante.push({ x: espaco.x, y: espaco.y + h, w: espaco.w, h: espaco.h - h });
          }
          chapa.espacos.splice(i, 1);
          chapa.espacos.push(...espacoRestante);
          chapa.espacos.sort((a, b) => (b.w * b.h) - (a.w * a.h));
          return true;
        }
      }
    }
    return false;
  };

  pecasExpandida.forEach(peca => {
    let colocada = false;
    for(let chapa of chapas) {
      if(encaixarPeca(chapa, peca)) {
        colocada = true;
        break;
      }
    }
    if(!colocada) {
      const novaChapa = criarChapaVazia();
      encaixarPeca(novaChapa, peca);
      chapas.push(novaChapa);
    }
  });

  const areaTotalPecas = pecasExpandida.reduce((s, p) => s + p.largura * p.altura, 0);
  const areaTotalChapas = chapas.length * larguraChapa * alturaChapa;
  const aproveitamento = ((areaTotalPecas / areaTotalChapas) * 100).toFixed(1);
  return { chapas, aproveitamento, qtdPecas: pecasExpandida.length };
};

const contarCortesGuilhotina = (chapa, larguraChapa, alturaChapa) => {
  const cortesH = new Set();
  const cortesV = new Set();
  chapa.pecasColocadas.forEach(p => {
    cortesH.add(p.y);
    cortesH.add(p.y + p.h);
    cortesV.add(p.x);
    cortesV.add(p.x + p.w);
  });
  cortesH.delete(0);
  cortesV.delete(0);
  cortesH.delete(alturaChapa);
  cortesV.delete(larguraChapa);
  return cortesH.size + cortesV.size;
};

const DesenhoPlanoCorteMisturado = ({ larguraChapa, alturaChapa, chapas, refilo }) => {
  const padding = 40;
  const espacoEntreChapas = 30;
  const maxLargura = Dimensions.get('window').width - 40;
  const escala = Math.min((maxLargura - padding * 2) / larguraChapa, 0.12);
  const w = larguraChapa * escala;
  const h = alturaChapa * escala;
  const svgWidth = w + padding * 2;
  const svgHeight = chapas.length * (h + espacoEntreChapas + 60) + padding;

  const desenharChapa = (chapa, indiceChapa) => {
    const offsetY = indiceChapa * (h + espacoEntreChapas + 60);
    const qtdCortes = contarCortesGuilhotina(chapa, larguraChapa, alturaChapa);
    return (
      <React.Fragment key={`chapa-${indiceChapa}`}>
        <SvgText x={padding} y={offsetY + 15} fill={Cores.destaque} fontSize="12" fontWeight="bold">
          Chapa {indiceChapa + 1} - {chapa.pecasColocadas.length} peças - {qtdCortes} cortes
        </SvgText>
        <Rect x={padding} y={padding + offsetY} width={w} height={h} fill="transparent" stroke={Cores.borda} strokeWidth="2"/>
        {chapa.pecasColocadas.map(p => (
          <Rect key={p.id} x={padding + p.x * escala} y={padding + offsetY + p.y * escala} width={p.w * escala} height={p.h * escala} fill={Cores.destaque + '30'} stroke={Cores.destaque} strokeWidth="2" />
        ))}
        <Line x1={padding} y1={padding + offsetY - 15} x2={padding + w} y2={padding + offsetY - 15} stroke={Cores.textoSec} strokeWidth="1" />
        <Line x1={padding} y1={padding + offsetY - 20} x2={padding} y2={padding + offsetY - 10} stroke={Cores.textoSec} strokeWidth="1" />
        <Line x1={padding + w} y1={padding + offsetY - 20} x2={padding + w} y2={padding + offsetY - 10} stroke={Cores.textoSec} strokeWidth="1" />
        <SvgText x={padding + w / 2} y={padding + offsetY - 20} fill={Cores.textoSec} fontSize="11" textAnchor="middle">{larguraChapa}mm</SvgText>
        <Line x1={padding - 15} y1={padding + offsetY} x2={padding - 15} y2={padding + offsetY + h} stroke={Cores.textoSec} strokeWidth="1" />
        <Line x1={padding - 20} y1={padding + offsetY} x2={padding - 10} y2={padding + offsetY} stroke={Cores.textoSec} strokeWidth="1" />
        <Line x1={padding - 20} y1={padding + offsetY + h} x2={padding - 10} y2={padding + offsetY + h} stroke={Cores.textoSec} strokeWidth="1" />
        <SvgText x={padding - 25} y={padding + offsetY + h / 2} fill={Cores.textoSec} fontSize="11" textAnchor="middle" transform={`rotate(-90 ${padding - 25} ${padding + offsetY + h / 2})`}>{alturaChapa}mm</SvgText>
      </React.Fragment>
    );
  };
  return (
    <View style={stylesPlano.container}>
      <Text style={stylesPlano.titulo}>Plano de Corte Otimizado - {chapas.length} {chapas.length === 1? 'Chapa' : 'Chapas'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Svg width={svgWidth} height={svgHeight}>{chapas.map((c, i) => desenharChapa(c, i))}</Svg>
        </ScrollView>
      </ScrollView>
      <Text style={stylesPlano.legenda}>Peças misturadas | Refilo: {refilo}mm</Text>
    </View>
  );
};

const DesenhoEsquemaTubo = ({ metrosTotal, qtdCortes, segmentos }) => {
  const padding = 20;
  const maxLargura = Dimensions.get('window').width - 40;
  const escala = segmentos.length > 0? Math.min((maxLargura - padding * 2) / Math.max(...segmentos.map(s => s.comprimento)), 0.3) : 0.3;
  const alturaBarra = 30;
  const espacamento = 15;
  const alturaTotal = segmentos.length * (alturaBarra + espacamento) + padding * 2;
  return (
    <View style={stylesPlano.container}>
      <Text style={stylesPlano.titulo}>Esquema de Corte - Tubo</Text>
      <Svg width={maxLargura} height={alturaTotal}>
        {segmentos.map((seg, i) => (
          <React.Fragment key={i}>
            <Rect x={padding} y={padding + i * (alturaBarra + espacamento)} width={seg.comprimento * escala} height={alturaBarra} fill={Cores.destaque + '40'} stroke={Cores.destaque} strokeWidth="2"/>
            <SvgText x={padding + (seg.comprimento * escala) / 2} y={padding + i * (alturaBarra + espacamento) + alturaBarra / 2 + 4} fill={Cores.texto} fontSize="12" textAnchor="middle" fontWeight="bold">
              {(seg.comprimento * 1000).toFixed(0)}mm
            </SvgText>
            <Line x1={padding} y1={padding + i * (alturaBarra + espacamento) + alturaBarra + 5} x2={padding + seg.comprimento * escala} y2={padding + i * (alturaBarra + espacamento) + alturaBarra + 5} stroke={Cores.textoSec} strokeWidth="1"/>
          </React.Fragment>
        ))}
      </Svg>
      <Text style={stylesPlano.legenda}>Total: {metrosTotal}m | {qtdCortes} cortes | {segmentos.length} segmentos</Text>
    </View>
  );
};

const stylesPlano = StyleSheet.create({
  container: { backgroundColor: Cores.card, padding: 15, borderRadius: 12, marginTop: 15, borderWidth: 1, borderColor: Cores.borda, alignItems: 'center' },
  titulo: { color: Cores.texto, fontWeight: 'bold', fontSize: 14, marginBottom: 10 },
  legenda: { color: Cores.textoSec, fontSize: 12, marginTop: 8, textAlign: 'center' }
});

export default function App() {
  const [modo, setModo] = useState(null);
  const [tela, setTela] = useState('novo');
  const [materiais, setMateriais] = useState([]);

  // HISTÓRICOS SEPARADOS
  const [historicoSerralheria, setHistoricoSerralheria] = useState([]);
  const [historicoMarcenaria, setHistoricoMarcenaria] = useState([]);

  // BUSCA POR CLIENTE
  const [buscaSerralheria, setBuscaSerralheria] = useState('');
  const [buscaMarcenaria, setBuscaMarcenaria] = useState('');

  // ESTADOS SERRALHERIA
  const [nomePeca, setNomePeca] = useState('');
  const [cliente, setCliente] = useState('');
  const [cidade, setCidade] = useState('SP');
  const [tuboSelecionado, setTuboSelecionado] = useState(null);
  const [tuboMetro, setTuboMetro] = useState('');
  const [qtdCortes, setQtdCortes] = useState('');
  const [custoCorte, setCustoCorte] = useState('2.50');
  const [qtdFuros, setQtdFuros] = useState('');
  const [custoFuro, setCustoFuro] = useState('1.80');
  const [cmSolda, setCmSolda] = useState('');
  const [custoCmSolda, setCustoCmSolda] = useState('0.90');
  const [pecasLaser, setPecasLaser] = useState('');
  const [custoLaser, setCustoLaser] = useState('');
  const [horasTrabalho, setHorasTrabalho] = useState('');
  const [valorHora, setValorHora] = useState('45');
  const [potenciaMaquinaKW, setPotenciaMaquinaKW] = useState('5');
  const [custoEnergiaKWh, setCustoEnergiaKWh] = useState('0.68');
  const [margem, setMargem] = useState('30');
  const [nomeMaterial, setNomeMaterial] = useState('');
  const [precoMaterial, setPrecoMaterial] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [modoImagem, setModoImagem] = useState('manual');
  const [imagemUri, setImagemUri] = useState(null);
  const [linhas, setLinhas] = useState([]);
  const [cotas, setCotas] = useState([]);
  const [pontoAtual, setPontoAtual] = useState(null);
  const [medidaReferencia, setMedidaReferencia] = useState('');
  const [linhaReferenciaIdx, setLinhaReferenciaIdx] = useState(null);
  const [ultimaPeca, setUltimaPeca] = useState(null);
  const [dimensaoImagem, setDimensaoImagem] = useState({ width: 0, height: 0 });
  const [cotaTemp, setCotaTemp] = useState(null);
  const [segmentosCorte, setSegmentosCorte] = useState([]);

  // ESTADOS MARCENARIA - NOVOS
  const [larguraChapa, setLarguraChapa] = useState('2750');
  const [alturaChapa, setAlturaChapa] = useState('1850');
  const [espessuraChapa, setEspessuraChapa] = useState('15');
  const [valorChapa, setValorChapa] = useState('');
  const [valorCorte, setValorCorte] = useState('3.50');
  const [nomePecaMarc, setNomePecaMarc] = useState('');
  const [clienteMarc, setClienteMarc] = useState('');
  const [refilo, setRefilo] = useState('5');
  const [resultadoNest, setResultadoNest] = useState(null);
  const [pecas, setPecas] = useState([{ id: Date.now().toString(), largura: '', altura: '', qtd: '1' }]);

  const adicionarPeca = () => {
    setPecas([...pecas, { id: Date.now().toString(), largura: '', altura: '', qtd: '1' }]);
  };
  const removerPeca = (id) => {
    if (pecas.length === 1) return Alert.alert('Aviso', 'Precisa ter pelo menos 1 medida');
    setPecas(pecas.filter(p => p.id!== id));
  };
  const atualizarPeca = (id, campo, valor) => {
    setPecas(pecas.map(p => p.id === id? {...p, [campo]: valor } : p));
  };

// FIM PARTE 1/4
  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    const mat = await AsyncStorage.getItem('materiais');
    const histSerr = await AsyncStorage.getItem('historicoSerralheria');
    const histMarc = await AsyncStorage.getItem('historicoMarcenaria');
    const cidadeSalva = await AsyncStorage.getItem('cidade');
    const pecaSalva = await AsyncStorage.getItem('ultimaPeca');

    if (mat) setMateriais(JSON.parse(mat));
    if (histSerr) setHistoricoSerralheria(JSON.parse(histSerr));
    if (histMarc) setHistoricoMarcenaria(JSON.parse(histMarc));
    if (cidadeSalva) {
      setCidade(cidadeSalva);
      buscarTarifa(cidadeSalva, false);
    }
    if (pecaSalva) setUltimaPeca(JSON.parse(pecaSalva));
  };

  const buscarTarifa = async (uf, mostrarAlerta = true) => {
    const chave = uf.toUpperCase().trim();
    const dados = TARIFAS_ENERGIA[chave] || TARIFAS_ENERGIA['PADRAO'];
    setCustoEnergiaKWh(dados.tarifa.toString());
    await AsyncStorage.setItem('cidade', chave);
    if (mostrarAlerta) Alert.alert('Tarifa atualizada', `${dados.nome}: R$ ${dados.tarifa}/kWh`);
  };

  const salvarMaterial = async () => {
    if (!nomeMaterial ||!precoMaterial) return Alert.alert('Erro', 'Preencha nome e preço');
    if (editandoId) {
      const lista = materiais.map(m => m.id === editandoId? {...m, nome: nomeMaterial, preco: parse(precoMaterial) } : m);
      setMateriais(lista);
      await AsyncStorage.setItem('materiais', JSON.stringify(lista));
      Alert.alert('Atualizado', 'Material editado com sucesso');
      cancelarEdicao();
    } else {
      const novo = { id: Date.now().toString(), nome: nomeMaterial, preco: parse(precoMaterial) };
      const lista = [...materiais, novo];
      setMateriais(lista);
      await AsyncStorage.setItem('materiais', JSON.stringify(lista));
      Alert.alert('Salvo', 'Material cadastrado');
      setNomeMaterial(''); setPrecoMaterial('');
    }
  };

  const iniciarEdicao = (material) => {
    setNomeMaterial(material.nome);
    setPrecoMaterial(material.preco.toString());
    setEditandoId(material.id);
  };

  const cancelarEdicao = () => {
    setNomeMaterial('');
    setPrecoMaterial('');
    setEditandoId(null);
  };

  const apagarMaterial = async (id) => {
    Alert.alert('Apagar material', 'Tem certeza que quer apagar esse tubo?', [
      { text: 'Cancelar' },
      { text: 'Apagar', onPress: async () => {
        const lista = materiais.filter(m => m.id!== id);
        setMateriais(lista);
        await AsyncStorage.setItem('materiais', JSON.stringify(lista));
        if (tuboSelecionado?.id === id) setTuboSelecionado(null);
      }}
    ]);
  };

  const calcularValores = () => {
    const precoTubo = tuboSelecionado? tuboSelecionado.preco : 0;
    const material = parse(tuboMetro) * precoTubo;
    const cortes = parse(qtdCortes) * parse(custoCorte);
    const furos = parse(qtdFuros) * parse(custoFuro);
    const solda = parse(cmSolda) * parse(custoCmSolda);
    const laser = parse(pecasLaser) * parse(custoLaser);
    const maoObra = parse(horasTrabalho) * parse(valorHora);
    const energia = parse(horasTrabalho) * parse(potenciaMaquinaKW) * parse(custoEnergiaKWh);
    const custoDireto = material + cortes + furos + solda + laser + maoObra + energia;
    const precoFinal = custoDireto * (1 + parse(margem) / 100);
    return { material, cortes, furos, solda, laser, maoObra, energia, custoDireto, precoFinal };
  };

  const valores = calcularValores();

  const limparCamposSerralheria = () => {
    setNomePeca('');
    setCliente('');
    setTuboSelecionado(null);
    setTuboMetro('');
    setQtdCortes('');
    setQtdFuros('');
    setCmSolda('');
    setPecasLaser('');
    setHorasTrabalho('');
    setSegmentosCorte([]);
  };

  const limparCamposMarcenaria = () => {
    setNomePecaMarc('');
    setClienteMarc('');
    setValorChapa('');
    setResultadoNest(null);
    setPecas([{ id: Date.now().toString(), largura: '', altura: '', qtd: '1' }]);
  };

  const salvarOrcamento = async () => {
    if (!tuboSelecionado) return Alert.alert('Erro', 'Selecione um tubo');
    const v = valores;
    const dados = {
      tipo: 'serralheria', nomePeca, cliente, cidade, data: new Date().toLocaleDateString('pt-BR'),
      tubo: tuboSelecionado.nome, material: v.material, cortes: v.cortes, furos: v.furos,
      solda: v.solda, laser: v.laser, maoObra: v.maoObra, energia: v.energia,
      custoDireto: v.custoDireto, precoFinal: v.precoFinal, margem, segmentos: segmentosCorte
    };
    const lista = [dados,...historicoSerralheria];
    setHistoricoSerralheria(lista);
    await AsyncStorage.setItem('historicoSerralheria', JSON.stringify(lista));
    Alert.alert('Salvo', 'Orçamento guardado no histórico da Serralheria');
  };

  const gerarPDF = async () => {
    if (!tuboSelecionado) return Alert.alert('Erro', 'Selecione um tubo');
    const v = valores;
    const html = `<html><body style="font-family: Arial; padding: 20px;">
      <h1>Orçamento - Serralheria</h1>
      <p><strong>Peça:</strong> ${nomePeca || 'Não informado'}</p>
      <p><strong>Cliente:</strong> ${cliente || 'Não informado'}</p>
      <p><strong>Cidade/UF:</strong> ${cidade}</p>
      <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
      <hr><h3>Material</h3>
      <p>${tuboSelecionado.nome}: ${tuboMetro}m x R$${tuboSelecionado.preco} = R$ ${v.material.toFixed(2)}</p>
      <h3>Processos</h3>
      <p>Cortes: ${qtdCortes} x R$${custoCorte} = R$ ${v.cortes.toFixed(2)}</p>
      <p>Furos: ${qtdFuros} x R$${custoFuro} = R$ ${v.furos.toFixed(2)}</p>
      <p>Solda: ${cmSolda}cm x R$${custoCmSolda} = R$ ${v.solda.toFixed(2)}</p>
      <p>Peças laser: ${pecasLaser} x R$${custoLaser} = R$ ${v.laser.toFixed(2)}</p>
      <h3>Mão de obra + Energia</h3>
      <p>Mão de obra: ${horasTrabalho}h x R$${valorHora} = R$ ${v.maoObra.toFixed(2)}</p>
      <p>Energia: ${horasTrabalho}h x ${potenciaMaquinaKW}KW x R$${custoEnergiaKWh} = R$ ${v.energia.toFixed(2)}</p>
      <hr><p><strong>Custo direto: R$ ${v.custoDireto.toFixed(2)}</strong></p>
      <p><strong>Margem: ${margem}%</strong></p>
      <h2>Preço Final: R$ ${v.precoFinal.toFixed(2)}</h2>
    </body></html>`;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  const escolherImagem = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status!== 'granted') return Alert.alert('Erro', 'Permissão negada');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (!result.canceled) {
      setImagemUri(result.assets[0].uri);
      setLinhas([]); setCotas([]); setPontoAtual(null); setLinhaReferenciaIdx(null); setSegmentosCorte([]);
      Image.getSize(result.assets[0].uri, (w, h) => setDimensaoImagem({ width: w, height: h }));
    }
  };

  const tirarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status!== 'granted') return Alert.alert('Erro', 'Permissão negada');
    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (!result.canceled) {
      setImagemUri(result.assets[0].uri);
      setLinhas([]); setCotas([]); setPontoAtual(null); setLinhaReferenciaIdx(null); setSegmentosCorte([]);
      Image.getSize(result.assets[0].uri, (w, h) => setDimensaoImagem({ width: w, height: h }));
    }
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      if (modoImagem === 'manual') {
        if (linhas.length >= 10) return Alert.alert('Limite atingido', 'Máximo de 10 linhas por foto');
        if (!pontoAtual) setPontoAtual({ x: locationX, y: locationY });
        else {
          const novaLinha = { x1: pontoAtual.x, y1: pontoAtual.y, x2: locationX, y2: locationY };
          setLinhas([...linhas, novaLinha]);
          setPontoAtual(null);
        }
      } else {
        if (!cotaTemp) setCotaTemp({ x1: locationX, y1: locationY });
        else {
          const novaCota = { x1: cotaTemp.x1, y1: cotaTemp.y1, x2: locationX, y2: locationY, valor: '' };
          setCotas([...cotas, novaCota]);
          setCotaTemp(null);
          Alert.prompt('Valor da cota', 'Digite o valor que está escrito no desenho em mm', [
            { text: 'Cancelar', onPress: () => setCotas(cotas) },
            { text: 'OK', onPress: (valor) => {
              const cotasAtualizadas = [...cotas.slice(0, -1), {...novaCota, valor: valor }];
              setCotas(cotasAtualizadas);
            }}
          ], 'plain-text', '', 'numeric');
        }
      }
    }
  });

  const removerUltimaLinha = () => {
    if (modoImagem === 'manual') {
      if (pontoAtual) setPontoAtual(null);
      else if (linhas.length > 0) {
        const novasLinhas = linhas.slice(0, -1);
        setLinhas(novasLinhas);
        if (linhaReferenciaIdx >= novasLinhas.length) setLinhaReferenciaIdx(null);
      }
    } else {
      if (cotaTemp) setCotaTemp(null);
      else if (cotas.length > 0) setCotas(cotas.slice(0, -1));
    }
  };

  const limparTudo = () => {
    Alert.alert('Limpar tudo', 'Tem certeza que quer apagar todas as linhas?', [
      { text: 'Cancelar' },
      { text: 'Limpar', onPress: () => {
        setLinhas([]); setCotas([]); setPontoAtual(null); setCotaTemp(null); setLinhaReferenciaIdx(null); setSegmentosCorte([]);
      }}
    ]);
  };

  const calcularPorImagem = async () => {
    if (modoImagem === 'manual') {
      if (linhas.length === 0) return Alert.alert('Erro', 'Marque os segmentos na imagem');
      if (!medidaReferencia) return Alert.alert('Erro', 'Informe a medida real');
      if (linhaReferenciaIdx === null || linhaReferenciaIdx >= linhas.length) return Alert.alert('Erro', 'Selecione qual linha é a referência');

      const linhaRef = linhas[linhaReferenciaIdx];
      const comprimentoPx = Math.sqrt(Math.pow(linhaRef.x2 - linhaRef.x1, 2) + Math.pow(linhaRef.y2 - linhaRef.y1, 2));
      if (comprimentoPx === 0) return Alert.alert('Erro', 'Linha de referência inválida');

      const mmPorPx = parse(medidaReferencia) / comprimentoPx;
      let totalMm = 0;
      const segs = [];
      linhas.forEach(l => {
        const comp = Math.sqrt(Math.pow(l.x2 - l.x1, 2) + Math.pow(l.y2 - l.y1, 2));
        const compMm = comp * mmPorPx;
        totalMm += compMm;
        segs.push({ comprimento: compMm / 1000 });
      });

      const metros = (totalMm / 1000).toFixed(2);
      const cortes = linhas.length * 2;
      setTuboMetro(metros);
      setQtdCortes(cortes.toString());
      setSegmentosCorte(segs);

      const peca = { medidaReferencia, linhaReferenciaIdx, totalLinhas: linhas.length };
      setUltimaPeca(peca);
      await AsyncStorage.setItem('ultimaPeca', JSON.stringify(peca));

      Alert.alert('Calculado', `${metros}m de tubo, ${cortes} cortes. Voltando ao orçamento.`);
      setTela('novo');
    } else {
      if (cotas.length === 0) return Alert.alert('Erro', 'Marque pelo menos uma cota no desenho');
      const cotasValidas = cotas.filter(c => c.valor && parse(c.valor) > 0);
      if (cotasValidas.length === 0) return Alert.alert('Erro', 'Informe o valor das cotas');

      let somaMmPorPx = 0;
      cotasValidas.forEach(c => {
        const compPx = Math.sqrt(Math.pow(c.x2 - c.x1, 2) + Math.pow(c.y2 - c.y1, 2));
        somaMmPorPx += parse(c.valor) / compPx;
      });
      const mmPorPxMedio = somaMmPorPx / cotasValidas.length;

      let totalMm = 0;
      const segs = [];
      linhas.forEach(l => {
        const comp = Math.sqrt(Math.pow(l.x2 - l.x1, 2) + Math.pow(l.y2 - l.y1, 2));
        const compMm = comp * mmPorPxMedio;
        totalMm += compMm;
        segs.push({ comprimento: compMm / 1000 });
      });

      const metros = (totalMm / 1000).toFixed(2);
      const cortes = linhas.length * 2;
      setTuboMetro(metros);
      setQtdCortes(cortes.toString());
      setSegmentosCorte(segs);

      Alert.alert('Calculado', `${metros}m de tubo, ${cortes} cortes. Escala: ${mmPorPxMedio.toFixed(3)}mm/px`);
      setTela('novo');
    }
  };

  const usarUltimaPeca = () => {
    if (!ultimaPeca) return Alert.alert('Erro', 'Nenhuma peça salva ainda');
    if (linhas.length === 0) return Alert.alert('Erro', 'Marque os segmentos primeiro');
    setMedidaReferencia(ultimaPeca.medidaReferencia);
    setLinhaReferenciaIdx(0);
    Alert.alert('Carregado', `Usando ${ultimaPeca.medidaReferencia}mm como referência`);
  };

  const calcularMarcenaria = () => {
    const pecasValidas = pecas.filter(p => p.largura && p.altura && p.qtd);
    if (pecasValidas.length === 0) return Alert.alert('Erro', 'Preencha pelo menos 1 medida completa');

    const resultado = calcularNestMisturado(parse(larguraChapa), parse(alturaChapa), pecasValidas, parse(refilo));

    let totalCortes = 0;
    resultado.chapas.forEach(chapa => {
      totalCortes += contarCortesGuilhotina(chapa, parse(larguraChapa), parse(alturaChapa));
    });

    setResultadoNest({...resultado, totalCortes});
  };

  const salvarOrcamentoMarcenaria = async () => {
    if (!resultadoNest) return Alert.alert('Erro', 'Calcule primeiro');
    const custoMaterial = resultadoNest.chapas.length * parse(valorChapa);
    const custoCortes = resultadoNest.totalCortes * parse(valorCorte);
    const custoTotal = custoMaterial + custoCortes;
    const dados = {
      tipo: 'marcenaria',
      nomePeca: nomePecaMarc,
      cliente: clienteMarc,
      data: new Date().toLocaleDateString('pt-BR'),
      chapa: `${larguraChapa}x${alturaChapa}x${espessuraChapa}mm`,
      peca: pecas.map(p => `${p.largura}x${p.altura}mm Qtd:${p.qtd}`).join(' | '),
      qtdPecas: resultadoNest.qtdPecas,
      chapasNecessarias: resultadoNest.chapas.length,
      totalCortes: resultadoNest.totalCortes,
      aproveitamento: resultadoNest.aproveitamento,
      custoMaterial: custoMaterial,
      custoCortes: custoCortes,
      custoTotal: custoTotal,
      precoFinal: custoTotal * (1 + parse(margem) / 100)
    };
    const lista = [dados,...historicoMarcenaria];
    setHistoricoMarcenaria(lista);
    await AsyncStorage.setItem('historicoMarcenaria', JSON.stringify(lista));
    Alert.alert('Salvo', 'Orçamento guardado no histórico da Marcenaria');
  };

// FIM PARTE 2/4
  const gerarPDFMarcenaria = async () => {
    if (!resultadoNest) return Alert.alert('Erro', 'Calcule primeiro');
    const custoMaterial = resultadoNest.chapas.length * parse(valorChapa);
    const custoCortes = resultadoNest.totalCortes * parse(valorCorte);
    const custoTotal = custoMaterial + custoCortes;
    const precoFinal = custoTotal * (1 + parse(margem) / 100);

    let htmlChapas = '';
    resultadoNest.chapas.forEach((c, idxChapa) => {
      const qtdCortesChapa = contarCortesGuilhotina(c, parse(larguraChapa), parse(alturaChapa));
      let pecasHTML = '';
      c.pecasColocadas.forEach(p => {
        const left = (p.x / parse(larguraChapa)) * 100;
        const top = (p.y / parse(alturaChapa)) * 100;
        const w = (p.w / parse(larguraChapa)) * 100;
        const h = (p.h / parse(alturaChapa)) * 100;
        pecasHTML += `<div style="position:absolute; left:${left}%; top:${top}%; width:${w}%; height:${h}%; border:2px solid #2D9CDB; background:rgba(45,156,219,0.3); box-sizing:border-box;"></div>`;
      });
      htmlChapas += `
        <div style="margin-bottom:30px;">
          <h4 style="color:#2D9CDB;">Chapa ${idxChapa + 1} - ${c.pecasColocadas.length} peças - ${qtdCortesChapa} cortes</h4>
          <div style="position:relative; width:100%; max-width:500px; height:${(parse(alturaChapa)/parse(larguraChapa))*500}px; border:2px solid #333; background:#1E1E1E;">
            ${pecasHTML}
          </div>
        </div>
      `;
    });

    const listaPecasHTML = pecas.map((p, i) =>
      `<p>Medida ${i+1}: ${p.largura}x${p.altura}mm - Qtd: ${p.qtd} peças</p>`
    ).join('');

    const html = `<html><body style="font-family: Arial; padding: 20px; background:#121212; color:#FFF;">
      <h1 style="color:#2D9CDB;">Plano de Corte Otimizado - Marcenaria</h1>
      <p><strong>Peça/Projeto:</strong> ${nomePecaMarc || 'Não informado'}</p>
      <p><strong>Cliente:</strong> ${clienteMarc || 'Não informado'}</p>
      <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
      <hr style="border-color:#333;">
      <h3 style="color:#FFF;">Chapa</h3>
      <p>Largura: ${larguraChapa}mm | Altura: ${alturaChapa}mm | Espessura: ${espessuraChapa}mm</p>
      <p>Valor unitário: R$ ${valorChapa} | Valor por corte: R$ ${valorCorte}</p>
      <h3 style="color:#FFF;">Peças</h3>${listaPecasHTML}
      <p>Refilo: ${refilo}mm | Margem: ${margem}%</p>
      <hr style="border-color:#333;">
      <h3 style="color:#2D9CDB;">Resultado Otimizado</h3>
      <p><strong>Total de chapas: ${resultadoNest.chapas.length}</strong></p>
      <p>Total de peças: ${resultadoNest.qtdPecas}</p>
      <p>Total de cortes guilhotina: ${resultadoNest.totalCortes}</p>
      <p>Aproveitamento: ${resultadoNest.aproveitamento}%</p>
      <p>Custo material: R$ ${custoMaterial.toFixed(2)}</p>
      <p>Custo cortes: R$ ${custoCortes.toFixed(2)}</p>
      <p><strong>Custo total: R$ ${custoTotal.toFixed(2)}</strong></p>
      <h2 style="color:#2D9CDB;">Preço Final: R$ ${precoFinal.toFixed(2)}</h2>
      <hr style="border-color:#333;">
      <h3 style="color:#FFF;">Plano de Corte</h3>
      ${htmlChapas}
    </body></html>`;

    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };

  const larguraTela = Dimensions.get('window').width - 40;
  const alturaImagem = dimensaoImagem.height > 0? (dimensaoImagem.height / dimensaoImagem.width) * larguraTela : 300;

  // FILTROS DE BUSCA
  const historicoSerralheriaFiltrado = historicoSerralheria.filter(item => 
    item.cliente?.toLowerCase().includes(buscaSerralheria.toLowerCase())
  );
  const historicoMarcenariaFiltrado = historicoMarcenaria.filter(item => 
    item.cliente?.toLowerCase().includes(buscaMarcenaria.toLowerCase())
  );

  if (modo === null) {
    return (
      <View style={[styles.container, {justifyContent: 'center'}]}>
        <StatusBar barStyle="light-content" />
        <Text style={[styles.titulo, {textAlign: 'center', marginBottom: 40}]}>Orçamento Pro</Text>
        <Text style={{textAlign: 'center', marginBottom: 30, fontSize: 16, color: Cores.textoSec}}>Escolha o tipo de orçamento:</Text>
        <TouchableOpacity onPress={() => setModo('serralheria')} style={styles.botaoGrande}>
          <Text style={styles.textoBotaoGrande}>Serralheria</Text>
          <Text style={styles.subtextoBotaoGrande}>Tubos, perfis, solda, corte</Text>
        </TouchableOpacity>
        <View style={{height: 20}} />
        <TouchableOpacity onPress={() => setModo('marcenaria')} style={styles.botaoGrande}>
          <Text style={styles.textoBotaoGrande}>Marcenaria</Text>
          <Text style={styles.subtextoBotaoGrande}>MDF, compensado, plano de corte otimizado</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (modo === 'marcenaria') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setModo(null); setResultadoNest(null); }}>
            <Text style={styles.voltar}>← Trocar Modo</Text>
          </TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginLeft: 10}}>
            <TouchableOpacity style={[styles.tab, tela === 'novo' && styles.tabAtiva]} onPress={() => setTela('novo')}>
              <Text style={tela === 'novo'? styles.tabTextAtiva : styles.tabText}>Novo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tela === 'materiais' && styles.tabAtiva]} onPress={() => setTela('materiais')}>
              <Text style={tela === 'materiais'? styles.tabTextAtiva : styles.tabText}>Materiais</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tab, tela === 'historico' && styles.tabAtiva]} onPress={() => setTela('historico')}>
              <Text style={tela === 'historico'? styles.tabTextAtiva : styles.tabText}>Histórico</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* TELA NOVO MARCENARIA */}
        {tela === 'novo' && (
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.titulo}>Novo Orçamento - Marcenaria</Text>
            {resultadoNest && (
              <View style={styles.boxTotal}>
                <Text style={styles.labelTotal}>Chapas necessárias: {resultadoNest.chapas.length}</Text>
                <Text style={styles.labelTotal}>Aproveitamento: {resultadoNest.aproveitamento}%</Text>
                <Text style={styles.labelTotal}>Total de cortes: {resultadoNest.totalCortes}</Text>
                {valorChapa && (
                  <Text style={styles.valorFinal}>Preço Final: R$ {((resultadoNest.chapas.length * parse(valorChapa) + resultadoNest.totalCortes * parse(valorCorte)) * (1 + parse(margem) / 100)).toFixed(2)}</Text>
                )}
              </View>
            )}

            <Text style={styles.subtitulo}>Dados do Orçamento</Text>
            <Text style={styles.label}>Nome da peça/projeto</Text>
            <TextInput value={nomePecaMarc} onChangeText={setNomePecaMarc} style={styles.input} placeholder="Ex: Armário cozinha" placeholderTextColor={Cores.textoSec} />
            <Text style={styles.label}>Cliente</Text>
            <TextInput value={clienteMarc} onChangeText={setClienteMarc} style={styles.input} placeholder="Nome do cliente" placeholderTextColor={Cores.textoSec} />

            <Text style={[styles.subtitulo, {marginTop: 15}]}>Dados da Chapa</Text>
            <Text style={styles.label}>Largura da chapa mm</Text>
            <TextInput keyboardType="numeric" value={larguraChapa} onChangeText={setLarguraChapa} style={styles.input} />
            <Text style={styles.label}>Altura da chapa mm</Text>
            <TextInput keyboardType="numeric" value={alturaChapa} onChangeText={setAlturaChapa} style={styles.input} />
            <Text style={styles.label}>Espessura mm</Text>
            <TextInput keyboardType="numeric" value={espessuraChapa} onChangeText={setEspessuraChapa} style={styles.input} />
            <Text style={styles.label}>Valor da chapa R$</Text>
            <TextInput keyboardType="numeric" value={valorChapa} onChangeText={setValorChapa} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
            <Text style={styles.label}>Valor por corte R$</Text>
            <TextInput keyboardType="numeric" value={valorCorte} onChangeText={setValorCorte} style={styles.input} placeholder="3.50" placeholderTextColor={Cores.textoSec} />

            <Text style={[styles.subtitulo, {marginTop: 15}]}>Dados da Peça</Text>

            {pecas.map((p, idx) => (
              <View key={p.id} style={{backgroundColor: Cores.card, padding: 12, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: Cores.borda}}>
                <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                  <Text style={[styles.label, {marginBottom: 0}]}>Medida {idx + 1}</Text>
                  {pecas.length > 1 && (
                    <TouchableOpacity onPress={() => removerPeca(p.id)}>
                      <Text style={{color: Cores.erro, fontWeight: 'bold'}}>Remover</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.label}>Largura mm</Text>
                <TextInput keyboardType="numeric" value={p.largura} onChangeText={(v) => atualizarPeca(p.id, 'largura', v)} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
                <Text style={styles.label}>Altura mm</Text>
                <TextInput keyboardType="numeric" value={p.altura} onChangeText={(v) => atualizarPeca(p.id, 'altura', v)} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
                <Text style={styles.label}>Quantidade</Text>
                <TextInput keyboardType="numeric" value={p.qtd} onChangeText={(v) => atualizarPeca(p.id, 'qtd', v)} style={styles.input} />
              </View>
            ))}

            <TouchableOpacity onPress={adicionarPeca} style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: Cores.destaque, borderRadius: 8, marginBottom: 10}}>
              <Text style={{color: Cores.destaque, fontWeight: 'bold', fontSize: 16}}>+ Adicionar Medida</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Refilo entre peças mm</Text>
            <TextInput keyboardType="numeric" value={refilo} onChangeText={setRefilo} style={styles.input} />
            <Text style={styles.label}>Margem %</Text>
            <TextInput keyboardType="numeric" value={margem} onChangeText={setMargem} style={styles.input} />

            <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
              <TouchableOpacity style={[styles.botaoSec, {flex: 1}]} onPress={limparCamposMarcenaria}>
                <Text style={styles.botaoSecText}>Limpar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.botaoPrimario, {flex: 2}]} onPress={calcularMarcenaria}>
                <Text style={styles.botaoPrimarioText}>Calcular</Text>
              </TouchableOpacity>
            </View>

            {resultadoNest && (
              <View style={[styles.boxTotal, {marginTop: 20}]}>
                <Text style={styles.labelTotal}>Resultado do Nest Otimizado:</Text>
                <Text style={styles.destaqueBox}>Total de chapas: {resultadoNest.chapas.length}</Text>
                <Text style={styles.textoBox}>Total de peças: {resultadoNest.qtdPecas}</Text>
                <Text style={styles.textoBox}>Total de cortes: {resultadoNest.totalCortes}</Text>
                <Text style={styles.textoBox}>Aproveitamento: {resultadoNest.aproveitamento}%</Text>

                <DesenhoPlanoCorteMisturado
                  larguraChapa={parse(larguraChapa)}
                  alturaChapa={parse(alturaChapa)}
                  chapas={resultadoNest.chapas}
                  refilo={parse(refilo)}
                />

                {valorChapa && (
                  <>
                    <Text style={[styles.textoBox, {marginTop: 10}]}>Custo material: R$ {(resultadoNest.chapas.length * parse(valorChapa)).toFixed(2)}</Text>
                    <Text style={styles.textoBox}>Custo cortes: R$ {(resultadoNest.totalCortes * parse(valorCorte)).toFixed(2)}</Text>
                    <Text style={styles.valorFinal}>Preço Final: R$ {((resultadoNest.chapas.length * parse(valorChapa) + resultadoNest.totalCortes * parse(valorCorte)) * (1 + parse(margem) / 100)).toFixed(2)}</Text>
                  </>
                )}

                <View style={{marginTop: 15, gap: 10}}>
                  <TouchableOpacity style={styles.botaoSec} onPress={salvarOrcamentoMarcenaria}>
                    <Text style={styles.botaoSecText}>Salvar Orçamento</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.botaoSec} onPress={gerarPDFMarcenaria}>
                    <Text style={styles.botaoSecText}>Gerar PDF do Plano</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <View style={{height: 50}} />
          </ScrollView>
        )}

// FIM PARTE 3/4
        {/* TELA MATERIAIS MARCENARIA */}
        {tela === 'materiais' && (
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.titulo}>Cadastro de Chapas/Materiais</Text>
            <Text style={styles.label}>Nome do material</Text>
            <TextInput value={nomeMaterial} onChangeText={setNomeMaterial} style={styles.input} placeholder="Ex: MDF 15mm Ultra" placeholderTextColor={Cores.textoSec} />
            <Text style={styles.label}>Preço por chapa R$</Text>
            <TextInput keyboardType="numeric" value={precoMaterial} onChangeText={setPrecoMaterial} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
            <View style={{flexDirection: 'row', gap: 10}}>
              <TouchableOpacity style={[styles.botaoPrimario, {flex: 1}]} onPress={salvarMaterial}>
                <Text style={styles.botaoPrimarioText}>{editandoId? "Atualizar" : "Salvar"}</Text>
              </TouchableOpacity>
              {editandoId && (
                <TouchableOpacity style={[styles.botaoSec, {flex: 1}]} onPress={cancelarEdicao}>
                  <Text style={styles.botaoSecText}>Cancelar</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.subtitulo, {marginTop: 20}]}>Materiais cadastrados</Text>
            <FlatList
              data={materiais}
              keyExtractor={item => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({item}) => (
                <View style={styles.cardItem}>
                  <View>
                    <Text style={styles.cardTitulo}>{item.nome}</Text>
                    <Text style={styles.cardSub}>R$ {item.preco}/chapa</Text>
                  </View>
                  <View style={{flexDirection: 'row', gap: 10}}>
                    <TouchableOpacity style={styles.botaoPequeno} onPress={() => iniciarEdicao(item)}>
                      <Text style={styles.botaoPequenoText}>Editar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.botaoPequeno, {backgroundColor: Cores.erro}]} onPress={() => apagarMaterial(item.id)}>
                      <Text style={styles.botaoPequenoText}>X</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.textoSec}>Nenhum material cadastrado</Text>}
            />
            <View style={{height: 50}} />
          </ScrollView>
        )}

        {/* TELA HISTÓRICO MARCENARIA */}
        {tela === 'historico' && (
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.titulo}>Histórico de Orçamentos</Text>

            {/* CAMPO DE BUSCA MARCENARIA */}
            <View style={{flexDirection: 'row', marginBottom: 15, gap: 10}}>
              <TextInput 
                value={buscaMarcenaria} 
                onChangeText={setBuscaMarcenaria} 
                style={[styles.input, {flex: 1, marginBottom: 0}]} 
                placeholder="🔍 Buscar por cliente..." 
                placeholderTextColor={Cores.textoSec} 
              />
              {buscaMarcenaria.length > 0 && (
                <TouchableOpacity 
                  style={[styles.botaoSec, {paddingHorizontal: 15, justifyContent: 'center'}]} 
                  onPress={() => setBuscaMarcenaria('')}
                >
                  <Text style={styles.botaoSecText}>Limpar</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={{color: Cores.textoSec, fontSize: 12, marginBottom: 10}}>
              {historicoMarcenariaFiltrado.length} de {historicoMarcenaria.length} orçamentos
            </Text>

            <FlatList
              data={historicoMarcenariaFiltrado}
              keyExtractor={(_, i) => i.toString()}
              keyboardShouldPersistTaps="handled"
              renderItem={({item}) => (
                <View style={styles.cardItem}>
                  <Text style={styles.cardTitulo}>{item.nomePeca || 'Sem nome'}</Text>
                  <Text style={styles.cardSub}>Cliente: {item.cliente || 'Não informado'}</Text>
                  <Text style={styles.cardSub}>Data: {item.data}</Text>
                  <Text style={styles.cardSub}>Chapa: {item.chapa}</Text>
                  <Text style={styles.cardSub}>Chapas: {item.chapasNecessarias} | Cortes: {item.totalCortes}</Text>
                  <Text style={styles.cardSub}>Aproveitamento: {item.aproveitamento}%</Text>
                  <Text style={styles.valorFinal}>R$ {item.precoFinal.toFixed(2)}</Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.textoSec}>
                  {buscaMarcenaria? 'Nenhum orçamento encontrado para esse cliente' : 'Nenhum orçamento salvo'}
                </Text>
              }
            />

            {historicoMarcenaria.length > 0 && (
              <TouchableOpacity style={[styles.botaoSec, {backgroundColor: Cores.erro, marginTop: 15}]} onPress={() => {
                Alert.alert('Limpar histórico', 'Tem certeza?', [
                  { text: 'Cancelar' },
                  { text: 'Limpar', onPress: async () => {
                    setHistoricoMarcenaria([]);
                    await AsyncStorage.removeItem('historicoMarcenaria');
                  }}
                ]);
              }}>
                <Text style={styles.botaoSecText}>Limpar Histórico Marcenaria</Text>
              </TouchableOpacity>
            )}
            <View style={{height: 50}} />
          </ScrollView>
        )}
      </View>
    );
  }

  // UI SERRALHERIA - PADRÃO COM ABAS
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setModo(null)}>
          <Text style={styles.voltar}>← Trocar Modo</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginLeft: 10}}>
          <TouchableOpacity style={[styles.tab, tela === 'novo' && styles.tabAtiva]} onPress={() => setTela('novo')}>
            <Text style={tela === 'novo'? styles.tabTextAtiva : styles.tabText}>Novo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tela === 'imagem' && styles.tabAtiva]} onPress={() => setTela('imagem')}>
            <Text style={tela === 'imagem'? styles.tabTextAtiva : styles.tabText}>Imagem</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tela === 'materiais' && styles.tabAtiva]} onPress={() => setTela('materiais')}>
            <Text style={tela === 'materiais'? styles.tabTextAtiva : styles.tabText}>Materiais</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tela === 'historico' && styles.tabAtiva]} onPress={() => setTela('historico')}>
            <Text style={tela === 'historico'? styles.tabTextAtiva : styles.tabText}>Histórico</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {tela === 'novo' && (
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.titulo}>Novo Orçamento - Serralheria</Text>
          <View style={styles.boxTotal}>
            <Text style={styles.labelTotal}>Custo direto: R$ {valores.custoDireto.toFixed(2)}</Text>
            <Text style={styles.valorFinal}>Preço Final: R$ {valores.precoFinal.toFixed(2)}</Text>
          </View>
          {segmentosCorte.length > 0 && <DesenhoEsquemaTubo metrosTotal={parse(tuboMetro)} qtdCortes={parse(qtdCortes)} segmentos={segmentosCorte} />}
          <Text style={styles.label}>Nome da peça</Text>
          <TextInput value={nomePeca} onChangeText={setNomePeca} style={styles.input} placeholder="Ex: Encosto Leg-01" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Cliente</Text>
          <TextInput value={cliente} onChangeText={setCliente} style={styles.input} placeholder="Nome do cliente" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Cidade/UF para tarifa</Text>
          <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 12}}>
            <TextInput value={cidade} onChangeText={setCidade} style={[styles.input, {flex: 1, marginBottom: 0}]} placeholder="Ex: SP, EDP-SP" placeholderTextColor={Cores.textoSec} autoCapitalize="characters" />
            <View style={{width: 10}} />
            <TouchableOpacity style={styles.botaoPequeno} onPress={() => buscarTarifa(cidade)}>
              <Text style={styles.botaoPequenoText}>Buscar</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.label}>Tubo de aço</Text>
          <FlatList horizontal data={materiais} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled"
            renderItem={({item}) => (
              <TouchableOpacity onPress={() => setTuboSelecionado(item)} style={[styles.chip, tuboSelecionado?.id === item.id && styles.chipAtivo]}>
                <Text style={tuboSelecionado?.id === item.id? styles.chipTextAtivo : styles.chipText}>{item.nome} R${item.preco}/m</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.textoSec}>Cadastre tubos na aba Materiais</Text>}
          />
          <Text style={styles.label}>Metros de tubo</Text>
          <TextInput keyboardType="numeric" value={tuboMetro} onChangeText={setTuboMetro} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Quantidade de cortes</Text>
          <TextInput keyboardType="numeric" value={qtdCortes} onChangeText={setQtdCortes} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Custo por corte R$</Text>
          <TextInput keyboardType="numeric" value={custoCorte} onChangeText={setCustoCorte} style={styles.input} />
          <Text style={styles.label}>Quantidade de furos</Text>
          <TextInput keyboardType="numeric" value={qtdFuros} onChangeText={setQtdFuros} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Custo por furo R$</Text>
          <TextInput keyboardType="numeric" value={custoFuro} onChangeText={setCustoFuro} style={styles.input} />
          <Text style={styles.label}>Cm de solda</Text>
          <TextInput keyboardType="numeric" value={cmSolda} onChangeText={setCmSolda} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Custo por cm solda R$</Text>
          <TextInput keyboardType="numeric" value={custoCmSolda} onChangeText={setCustoCmSolda} style={styles.input} />
          <Text style={styles.label}>Peças laser</Text>
          <TextInput keyboardType="numeric" value={pecasLaser} onChangeText={setPecasLaser} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Custo por peça laser R$</Text>
          <TextInput keyboardType="numeric" value={custoLaser} onChangeText={setCustoLaser} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Horas de trabalho</Text>
          <TextInput keyboardType="numeric" value={horasTrabalho} onChangeText={setHorasTrabalho} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Valor hora R$</Text>
          <TextInput keyboardType="numeric" value={valorHora} onChangeText={setValorHora} style={styles.input} />
          <Text style={styles.label}>Potência máquina KW</Text>
          <TextInput keyboardType="numeric" value={potenciaMaquinaKW} onChangeText={setPotenciaMaquinaKW} style={styles.input} />
          <Text style={styles.label}>Custo energia KWh R$</Text>
          <TextInput keyboardType="numeric" value={custoEnergiaKWh} onChangeText={setCustoEnergiaKWh} style={styles.input} />
          <Text style={styles.label}>Margem %</Text>
          <TextInput keyboardType="numeric" value={margem} onChangeText={setMargem} style={styles.input} />
          <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
            <TouchableOpacity style={[styles.botaoSec, {flex: 1}]} onPress={limparCamposSerralheria}>
              <Text style={styles.botaoSecText}>Limpar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.botaoPrimario, {flex: 2}]} onPress={salvarOrcamento}>
              <Text style={styles.botaoPrimarioText}>Salvar Orçamento</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.botaoSec, {marginTop: 10}]} onPress={gerarPDF}>
            <Text style={styles.botaoSecText}>Gerar PDF</Text>
          </TouchableOpacity>
          <View style={{height: 50}} />
        </ScrollView>
      )}

      {tela === 'imagem' && (
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.titulo}>Leitura de Desenho</Text>
          <View style={{flexDirection: 'row', marginBottom: 15, gap: 10}}>
            <TouchableOpacity onPress={() => setModoImagem('manual')} style={[styles.botaoModo, modoImagem === 'manual' && styles.botaoModoAtivo]}>
              <Text style={modoImagem === 'manual'? styles.textoModoAtivo : styles.textoModo}>Manual</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModoImagem('cota')} style={[styles.botaoModo, modoImagem === 'cota' && styles.botaoModoAtivo]}>
              <Text style={modoImagem === 'cota'? styles.textoModoAtivo : styles.textoModo}>Por Cota</Text>
            </TouchableOpacity>
          </View>
          <View style={{flexDirection: 'row', marginBottom: 15, gap: 10}}>
            <TouchableOpacity style={styles.botaoSec} onPress={escolherImagem}>
              <Text style={styles.botaoSecText}>Galeria</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botaoSec} onPress={tirarFoto}>
              <Text style={styles.botaoSecText}>Câmera</Text>
            </TouchableOpacity>
          </View>
          {imagemUri && (
            <>
              <View style={styles.avisoBox}>
                <Text style={styles.avisoTexto}>📐 Dica: Tire a foto bem de frente e na altura da peça pra medida ficar precisa</Text>
              </View>
              <View {...panResponder.panHandlers}>
                <View style={{ width: larguraTela, height: alturaImagem }}>
                  <Image source={{uri: imagemUri}} style={{width: larguraTela, height: alturaImagem, position: 'absolute'}} />
                  <Svg style={StyleSheet.absoluteFill}>
                    {linhas.map((l, i) => (
                      <Line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={i === linhaReferenciaIdx? Cores.erro : Cores.destaque} strokeWidth={i === linhaReferenciaIdx? 4 : 3} strokeLinecap="round" />
                    ))}
                    {cotas.map((c, i) => (
                      <React.Fragment key={`c${i}`}>
                        <Line x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke={Cores.destaque} strokeWidth="3" strokeDasharray="5,5" />
                        <Circle cx={c.x1} cy={c.y1} r="6" fill={Cores.destaque} />
                        <Circle cx={c.x2} cy={c.y2} r="6" fill={Cores.destaque} />
                        {c.valor && <SvgText x={(c.x1 + c.x2) / 2} y={(c.y1 + c.y2) / 2 - 10} fill="white" fontSize="14" fontWeight="bold" textAnchor="middle">{c.valor}mm</SvgText>}
                      </React.Fragment>
                    ))}
                    {pontoAtual && <Circle cx={pontoAtual.x} cy={pontoAtual.y} r="8" fill={Cores.erro} />}
                    {cotaTemp && <Circle cx={cotaTemp.x1} cy={cotaTemp.y1} r="8" fill={Cores.destaque} />}
                  </Svg>
                </View>
              </View>
              <Text style={{marginTop: 10, fontSize: 12, color: Cores.textoSec}}>
                {modoImagem === 'manual'? `Toque nos cantos da peça. ${linhas.length}/10 linhas. Vermelha = referência.` : 'Toque nas duas extremidades de uma cota do desenho. Depois informe o valor.'}
              </Text>
              {modoImagem === 'manual'? (
                <>
                  <Text style={[styles.label, {marginTop: 15}]}>Medida real da referência mm</Text>
                  <TextInput keyboardType="numeric" value={medidaReferencia} onChangeText={setMedidaReferencia} style={styles.input} placeholder="Ex: 600" placeholderTextColor={Cores.textoSec} />
                  {linhas.length > 0 && (
                    <>
                      <Text style={styles.label}>Qual linha é a referência?</Text>
                      <FlatList horizontal data={linhas} keyExtractor={(_, i) => i.toString()}
                        renderItem={({item, index}) => (
                          <TouchableOpacity onPress={() => setLinhaReferenciaIdx(index)} style={[styles.chip, linhaReferenciaIdx === index && styles.chipAtivo]}>
                            <Text style={linhaReferenciaIdx === index? styles.chipTextAtivo : styles.chipText}>Linha {index + 1}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    </>
                  )}
                  {ultimaPeca && (
                    <TouchableOpacity style={[styles.botaoSec, {marginTop: 10}]} onPress={usarUltimaPeca}>
                      <Text style={styles.botaoSecText}>Usar última peça: {ultimaPeca.medidaReferencia}mm</Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                <Text style={[styles.label, {marginTop: 15, fontWeight: 'bold'}]}>Cotas marcadas: {cotas.filter(c => c.valor).length}</Text>
              )}
              <View style={{flexDirection: 'row', marginTop: 15, gap: 10}}>
                <TouchableOpacity style={[styles.botaoSec, {flex: 1}]} onPress={removerUltimaLinha}>
                  <Text style={styles.botaoSecText}>Desfazer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.botaoSec, {flex: 1, backgroundColor: Cores.erro}]} onPress={limparTudo}>
                  <Text style={styles.botaoSecText}>Limpar</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.botaoPrimario, {marginTop: 15}]} onPress={calcularPorImagem}>
                <Text style={styles.botaoPrimarioText}>Calcular Medidas</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={{height: 50}} />
        </ScrollView>
      )}

      {tela === 'materiais' && (
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.titulo}>Cadastro de Tubos</Text>
          <Text style={styles.label}>Nome do tubo</Text>
          <TextInput value={nomeMaterial} onChangeText={setNomeMaterial} style={styles.input} placeholder="Ex: Tubo 40x40 #16" placeholderTextColor={Cores.textoSec} />
          <Text style={styles.label}>Preço por metro R$</Text>
          <TextInput keyboardType="numeric" value={precoMaterial} onChangeText={setPrecoMaterial} style={styles.input} placeholder="0" placeholderTextColor={Cores.textoSec} />
          <View style={{flexDirection: 'row', gap: 10}}>
            <TouchableOpacity style={[styles.botaoPrimario, {flex: 1}]} onPress={salvarMaterial}>
              <Text style={styles.botaoPrimarioText}>{editandoId? "Atualizar" : "Salvar"}</Text>
            </TouchableOpacity>
            {editandoId && (
              <TouchableOpacity style={[styles.botaoSec, {flex: 1}]} onPress={cancelarEdicao}>
                <Text style={styles.botaoSecText}>Cancelar</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={[styles.subtitulo, {marginTop: 20}]}>Tubos cadastrados</Text>
          <FlatList
            data={materiais}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({item}) => (
              <View style={styles.cardItem}>
                <View>
                  <Text style={styles.cardTitulo}>{item.nome}</Text>
                  <Text style={styles.cardSub}>R$ {item.preco}/m</Text>
                </View>
                <View style={{flexDirection: 'row', gap: 10}}>
                  <TouchableOpacity style={styles.botaoPequeno} onPress={() => iniciarEdicao(item)}>
                    <Text style={styles.botaoPequenoText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.botaoPequeno, {backgroundColor: Cores.erro}]} onPress={() => apagarMaterial(id)}>
                    <Text style={styles.botaoPequenoText}>X</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.textoSec}>Nenhum tubo cadastrado</Text>}
          />
          <View style={{height: 50}} />
        </ScrollView>
      )}

      {tela === 'historico' && (
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.titulo}>Histórico de Orçamentos</Text>

          {/* CAMPO DE BUSCA SERRALHERIA */}
          <View style={{flexDirection: 'row', marginBottom: 15, gap: 10}}>
            <TextInput 
              value={buscaSerralheria} 
              onChangeText={setBuscaSerralheria} 
              style={[styles.input, {flex: 1, marginBottom: 0}]} 
              placeholder="🔍 Buscar por cliente..." 
              placeholderTextColor={Cores.textoSec} 
            />
            {buscaSerralheria.length > 0 && (
              <TouchableOpacity 
                style={[styles.botaoSec, {paddingHorizontal: 15, justifyContent: 'center'}]} 
                onPress={() => setBuscaSerralheria('')}
              >
                <Text style={styles.botaoSecText}>Limpar</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={{color: Cores.textoSec, fontSize: 12, marginBottom: 10}}>
            {historicoSerralheriaFiltrado.length} de {historicoSerralheria.length} orçamentos
          </Text>

          <FlatList
            data={historicoSerralheriaFiltrado}
            keyExtractor={(_, i) => i.toString()}
            keyboardShouldPersistTaps="handled"
            renderItem={({item}) => (
              <View style={styles.cardItem}>
                <Text style={styles.cardTitulo}>{item.nomePeca || 'Sem nome'}</Text>
                <Text style={styles.cardSub}>Cliente: {item.cliente || 'Não informado'}</Text>
                <Text style={styles.cardSub}>Data: {item.data}</Text>
                <Text style={styles.cardSub}>Tubo: {item.tubo}</Text>
                <Text style={styles.cardSub}>Custo: R$ {item.custoDireto.toFixed(2)}</Text>
                <Text style={styles.valorFinal}>R$ {item.precoFinal.toFixed(2)}</Text>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.textoSec}>
                {buscaSerralheria? 'Nenhum orçamento encontrado para esse cliente' : 'Nenhum orçamento salvo'}
              </Text>
            }
          />

          {historicoSerralheria.length > 0 && (
            <TouchableOpacity style={[styles.botaoSec, {backgroundColor: Cores.erro, marginTop: 15}]} onPress={() => {
              Alert.alert('Limpar histórico', 'Tem certeza?', [
                { text: 'Cancelar' },
                { text: 'Limpar', onPress: async () => {
                  setHistoricoSerralheria([]);
                  await AsyncStorage.removeItem('historicoSerralheria');
                }}
              ]);
            }}>
              <Text style={styles.botaoSecText}>Limpar Histórico Serralheria</Text>
            </TouchableOpacity>
          )}
          <View style={{height: 50}} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Cores.fundo, paddingTop: 40 },
  scroll: { flex: 1, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: Cores.borda },
  voltar: { color: Cores.destaque, fontSize: 16 },
  tituloHeader: { color: Cores.texto, fontSize: 20, fontWeight: 'bold', marginLeft: 15 },
  titulo: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: Cores.texto },
  subtitulo: { fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: Cores.texto },
  label: { color: Cores.texto, marginBottom: 5, fontSize: 14 },
  input: { backgroundColor: Cores.card, borderWidth: 1, borderColor: Cores.borda, padding: 12, marginBottom: 12, borderRadius: 8, color: Cores.texto, fontSize: 16 },
  chip: { padding: 10, backgroundColor: Cores.card, marginRight: 10, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: Cores.borda },
  chipAtivo: { backgroundColor: Cores.destaque, borderColor: Cores.destaque },
  chipText: { color: Cores.texto },
  chipTextAtivo: { color: '#fff', fontWeight: 'bold' },
  boxTotal: { backgroundColor: Cores.card, padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: Cores.borda },
  labelTotal: { fontSize: 14, color: Cores.textoSec },
  valorFinal: { fontSize: 22, fontWeight: 'bold', color: Cores.destaque, marginTop: 5 },
  textoBox: { color: Cores.texto, fontSize: 14, marginBottom: 4 },
  destaqueBox: { color: Cores.texto, fontWeight: 'bold', fontSize: 18, marginTop: 10 },
  botaoModo: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Cores.borda, backgroundColor: Cores.card },
  botaoModoAtivo: { backgroundColor: Cores.destaque, borderColor: Cores.destaque },
  textoModo: { textAlign: 'center', color: Cores.textoSec },
  textoModoAtivo: { textAlign: 'center', color: 'white', fontWeight: 'bold' },
  botaoGrande: { backgroundColor: Cores.destaque, padding: 30, borderRadius: 12, alignItems: 'center' },
  textoBotaoGrande: { color: 'white', fontSize: 24, fontWeight: 'bold' },
  subtextoBotaoGrande: { color: 'white', fontSize: 14, marginTop: 5, opacity: 0.9 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, borderRadius: 20 },
  tabAtiva: { backgroundColor: Cores.destaque },
  tabText: { color: Cores.textoSec, fontSize: 14 },
  tabTextAtiva: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  botaoPrimario: { backgroundColor: Cores.destaque, padding: 15, borderRadius: 8, alignItems: 'center' },
  botaoPrimarioText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  botaoSec: { backgroundColor: Cores.card, padding: 15, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: Cores.borda },
  botaoSecText: { color: Cores.texto, fontSize: 16, fontWeight: '600' },
  botaoPequeno: { backgroundColor: Cores.destaque, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  botaoPequenoText: { color: 'white', fontWeight: 'bold' },
  cardItem: { backgroundColor: Cores.card, padding: 15, marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: Cores.borda },
  cardTitulo: { color: Cores.texto, fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  cardSub: { color: Cores.textoSec, fontSize: 13, marginBottom: 2 },
  textoSec: { color: Cores.textoSec },
  avisoBox: { backgroundColor: '#2D9CDB20', padding: 12, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: Cores.destaque, marginBottom: 15 },
  avisoTexto: { color: Cores.texto, fontSize: 13 },
});
// FIM PARTE 4/4