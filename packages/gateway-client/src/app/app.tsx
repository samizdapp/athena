import { Navigate, Route, Routes } from 'react-router-dom';
import styled from 'styled-components';

import Home from './pages';

const StyledApp = styled.div`
    // Your style here
`;

export function App() {
    return (
        <StyledApp>
            <Routes>
                <Route path="/pwa" element={<Home />} />
                <Route path="*" element={<Navigate to="/pwa" replace />} />
            </Routes>
        </StyledApp>
    );
}

export default App;
