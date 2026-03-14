import { useState } from 'react';
import './index.css';
import { LayoutDashboard, Wallet, ArrowRightLeft, Lightbulb, BarChart2, PieChart } from 'lucide-react';
import Overview from './components/Overview';
import CashFlow from './components/CashFlow';
import Transactions from './components/Transactions';
import Insights from './components/Insights';
import SpendingBreakdown from './components/SpendingBreakdown';

function App() {
    const [activeTab, setActiveTab] = useState('overview');

    const renderContent = () => {
        switch (activeTab) {
            case 'overview': return <Overview />;
            case 'cashflow': return <CashFlow />;
            case 'spending': return <SpendingBreakdown />;
            case 'transactions': return <Transactions />;
            case 'insights': return <Insights />;
            default: return <Overview />;
        }
    };

    const headerTitle: Record<string, string> = {
        overview: 'Financial Overview',
        cashflow: 'Cash Flow Analytics',
        spending: 'Spending by Category',
        transactions: 'Recent Transactions',
        insights: 'Insights & Progress',
    };

    return (
        <div className="dashboard-layout">
            {/* Sidebar */}
            <aside className="sidebar glass-panel">
                <div className="logo-container">
                    <div className="logo-icon flex-center">
                        <PieChart size={24} color="var(--accent-primary)" />
                    </div>
                    <h1 className="logo-text text-gradient">Fintegra</h1>
                </div>

                <nav className="nav-menu">
                    {[
                        { id: 'overview', icon: <LayoutDashboard size={20} />, label: 'Overview' },
                        { id: 'cashflow', icon: <Wallet size={20} />, label: 'Cash Flow' },
                        { id: 'spending', icon: <BarChart2 size={20} />, label: 'Spending' },
                        { id: 'transactions', icon: <ArrowRightLeft size={20} />, label: 'Transactions' },
                        { id: 'insights', icon: <Lightbulb size={20} />, label: 'Insights & Plan' },
                    ].map(({ id, icon, label }) => (
                        <button
                            key={id}
                            className={`nav-item ${activeTab === id ? 'active' : ''}`}
                            onClick={() => setActiveTab(id)}
                        >
                            {icon}
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>

                <div className="user-profile">
                    <div className="avatar flex-center">IK</div>
                    <div className="user-info">
                        <span className="user-name">Ilan Kor</span>
                        <span className="user-status text-success">Logged In</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="main-content">
                <header className="top-header flex-between animate-fade-in">
                    <h2>{headerTitle[activeTab] || 'Dashboard'}</h2>
                    <div className="date-badge glass-panel">
                        {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </div>
                </header>

                <div className="content-area animate-fade-in" style={{ animationDelay: '0.1s' }}>
                    {renderContent()}
                </div>
            </main>
        </div>
    );
}

export default App;
